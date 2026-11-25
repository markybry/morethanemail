import "server-only";
import type { User } from "@prisma/client";
import type { gmail_v1 } from "googleapis";
import { gmailFor } from "./google";
import { parseMessageParts, type Attachment } from "./mime";
import { demoCreateLabel, demoLabels, demoModifyLabels, demoThreadDetail, demoThreads } from "./demo-mail";

export type ThreadSummary = {
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  date: string; // ISO, of the latest message
  unread: boolean;
  messageCount: number;
  labelIds: string[];
  historyId?: string; // Gmail's version of the thread when fetched
};

// Gmail limits quota units per user per minute (a thread lookup costs 10), and
// enforces it over short windows, so firing dozens of lookups at once trips it.
// Lookups run a few at a time, and a rate-limited one waits and tries again.
const GMAIL_PARALLEL = 8;

export function isRateLimited(e: unknown): boolean {
  const err = e as { code?: unknown; status?: number; message?: string };
  const status = err.status ?? err.code;
  if (status === 429) return true;
  return status === 403 && /rate ?limit|quota exceeded|too many concurrent/i.test(err.message ?? "");
}

async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= 3 || !isRateLimited(e)) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt + Math.random() * 500));
    }
  }
}

// Like Promise.all over items, with at most `limit` running at once.
async function mapLimited<T, R>(items: T[], fn: (item: T) => Promise<R>, limit = GMAIL_PARALLEL): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Gmail nests labels by name: "Clients/Acme" sits under "Clients".
export type MailLabel = { id: string; name: string; unread: number; color?: string };

export type MessageDetail = {
  id: string;
  from: string;
  to: string;
  date: string; // ISO
  subject: string;
  html: string | null;
  text: string | null;
  attachments: Attachment[];
};

export type ThreadDetail = { threadId: string; subject: string; messages: MessageDetail[] };

export const INBOX = "INBOX";

// Gmail's search name for a label: "Clients/JR Lease" is label:clients-jr-lease.
const searchName = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");

// ---------- labels, kept in server memory ----------
// Labels rarely change, and asking Gmail for them on every page and list was a
// big share of the calls that got the app throttled. The list of labels is kept
// for an hour, unread counts for a couple of minutes. Labels made through the
// app clear it straight away; one renamed or deleted in Gmail shows within the
// hour, and one made in Gmail as soon as it's opened.
type GmailLabel = { id: string; name: string; type: string; color?: string };
const LABELS_TTL = 60 * 60_000;
const UNREAD_TTL = 2 * 60_000;
const labelCache = new Map<string, { labels: GmailLabel[]; at: number }>();
const unreadCache = new Map<string, { counts: Map<string, number>; at: number }>();

async function gmailLabels(user: User): Promise<GmailLabel[]> {
  const hit = labelCache.get(user.id);
  if (hit && Date.now() - hit.at < LABELS_TTL) return hit.labels;
  const res = await withBackoff(() => gmailFor(user).users.labels.list({ userId: "me" }));
  const labels = (res.data.labels ?? [])
    .filter((l) => l.id && l.name)
    .map((l) => ({ id: l.id!, name: l.name!, type: l.type ?? "user", color: l.color?.backgroundColor ?? undefined }));
  if (labelCache.size > 500) labelCache.clear();
  labelCache.set(user.id, { labels, at: Date.now() });
  return labels;
}

// After a label is made (or anything else that changes the list) in the app.
export function forgetLabels(userId: string) {
  labelCache.delete(userId);
  unreadCache.delete(userId);
}

// A label and every label under it ("Clients/JR" and "Clients/JR/Lease").
export async function labelWithSubLabels(user: User, labelId: string): Promise<{ id: string; name: string }[]> {
  if (labelId === INBOX) return [{ id: INBOX, name: "Inbox" }];
  const all = user.isDemo ? demoLabels() : await gmailLabels(user);
  const self = all.find((l) => l.id === labelId);
  if (!self) return [{ id: labelId, name: "" }];
  return all.filter((l) => l.id === labelId || l.name.startsWith(`${self.name}/`)).map((l) => ({ id: l.id, name: l.name }));
}

// One page of threads, newest first: in any of `labels` (a label and its
// sub-labels), or in all mail with none. For the inbox, primaryOnly matches
// Gmail's Primary tab. A query narrows the list. Gmail leaves out spam and trash.
export async function listThreads(
  user: User,
  opts: {
    labels?: { id: string; name: string }[];
    inboxOrLabelled?: boolean;
    after?: Date; // only threads with a message after this
    primaryOnly?: boolean;
    query?: string;
    pageToken?: string;
    excludeFrom?: string[]; // senders to leave out
  },
): Promise<{ threads: ThreadSummary[]; nextPageToken?: string }> {
  const query = opts.query?.trim();
  const labels = opts.labels ?? [];
  const primaryOnly = labels.length === 1 && labels[0].id === INBOX && !!opts.primaryOnly;
  if (user.isDemo) {
    const ids = labels.map((l) => l.id);
    const all = demoThreads(undefined, false, query).filter((t) => !opts.after || new Date(t.date) > opts.after);
    const threads = ids.length
      ? all.filter((t) => t.labelIds.some((l) => ids.includes(l)))
      : opts.inboxOrLabelled
        ? all.filter((t) => t.labelIds.some((l) => l.startsWith("Label_")))
        : all;
    const muted = new Set(opts.excludeFrom ?? []);
    const keep = (t: ThreadSummary) => !muted.has((t.from.match(/<([^>]+)>/)?.[1] ?? t.from).trim().toLowerCase());
    return { threads: (primaryOnly ? demoThreads(INBOX, true, query) : threads).filter(keep) };
  }

  // One label filters by id; several (with sub-labels) become an OR search.
  const anyOf = labels.length > 1 ? `{${labels.map((l) => `label:${searchName(l.name)}`).join(" ")}}` : "";
  // "Recent": what has been triaged, i.e. anything filed under one of the
  // user's labels (cards in a status are added by the board).
  const scope = opts.inboxOrLabelled ? "has:userlabels" : "";
  const after = opts.after ? `after:${Math.floor(opts.after.getTime() / 1000)}` : "";
  const exclude = (opts.excludeFrom ?? []).map((a) => `-from:${a.replace(/[^\w.@+-]/g, "")}`).join(" ");
  const q = [primaryOnly ? "category:primary" : "", anyOf, scope, after, exclude, query ?? ""].filter(Boolean).join(" ");
  const gmail = gmailFor(user);
  const res = await gmail.users.threads.list({
    userId: "me",
    labelIds: labels.length === 1 ? [labels[0].id] : undefined,
    q: q || undefined,
    maxResults: 30,
    pageToken: opts.pageToken,
  });
  const listed = res.data.threads ?? [];
  return { threads: await summarizeThreads(user, listed), nextPageToken: res.data.nextPageToken ?? undefined };
}

// Thread metadata by thread, kept in server memory. Gmail's list calls give each
// thread's historyId (a version that changes with any new message or label), so
// a thread whose historyId hasn't moved is served from here instead of costing
// another 10-unit lookup. Survives between requests while the server instance lives.
const META_HEADERS = ["Subject", "From", "Date", "To", "Cc"];
const threadCache = new Map<string, gmail_v1.Schema$Thread>();
const CACHE_MAX = 5000;

type ThreadRef = string | { id?: string | null; historyId?: string | null };

async function getThreadMeta(user: User, gmail: gmail_v1.Gmail, ref: ThreadRef): Promise<gmail_v1.Schema$Thread | null> {
  const id = typeof ref === "string" ? ref : ref.id;
  if (!id) return null;
  const known = typeof ref === "string" ? undefined : ref.historyId;
  const key = `${user.id}:${id}`;
  const cached = threadCache.get(key);
  if (known && cached?.historyId === known) return cached;
  try {
    const t = await withBackoff(() => gmail.users.threads.get({ userId: "me", id, format: "metadata", metadataHeaders: META_HEADERS }));
    threadCache.delete(key);
    threadCache.set(key, t.data);
    if (threadCache.size > CACHE_MAX) threadCache.delete(threadCache.keys().next().value!);
    return t.data;
  } catch (e) {
    if ((e as { code?: number }).code === 404) return null;
    throw e;
  }
}

// Current metadata for specific threads. Threads that no longer exist are left out.
// Pass list results (with historyId) rather than bare ids where possible, so unchanged threads come from memory.
export async function summarizeThreads(user: User, threads: ThreadRef[]): Promise<ThreadSummary[]> {
  if (user.isDemo) {
    const ids = threads.map((t) => (typeof t === "string" ? t : t.id));
    return demoThreads().filter((t) => ids.includes(t.threadId));
  }
  const gmail = gmailFor(user);
  const results = await mapLimited(threads, async (ref) => {
    const t = await getThreadMeta(user, gmail, ref);
    return t ? summarize(t) : null;
  });
  return results.filter((t): t is ThreadSummary => t !== null);
}

// Which threads changed in Gmail since a historyId (one cheap call per 500
// changes), and Gmail's current historyId. Null when Gmail no longer has
// history that far back (about a week), and everything must be re-checked.
export async function changedThreadsSince(user: User, startHistoryId: string): Promise<{ changed: Set<string>; historyId: string } | null> {
  const gmail = gmailFor(user);
  const changed = new Set<string>();
  let pageToken: string | undefined;
  let historyId = startHistoryId;
  try {
    for (let page = 0; page < 20; page++) {
      const res = await withBackoff(() => gmail.users.history.list({ userId: "me", startHistoryId, pageToken, maxResults: 500 }));
      for (const h of res.data.history ?? []) for (const m of h.messages ?? []) if (m.threadId) changed.add(m.threadId);
      if (res.data.historyId) historyId = res.data.historyId;
      pageToken = res.data.nextPageToken ?? undefined;
      if (!pageToken) return { changed, historyId };
    }
    return null; // a huge amount changed: just re-check everything
  } catch (e) {
    if ((e as { code?: number }).code === 404) return null;
    throw e;
  }
}

// The label's display name, or null if the user has no such label.
// From the cached label list. A label it doesn't know may be one just made in
// Gmail, so the list is fetched again once before saying it doesn't exist.
export async function getLabelName(user: User, labelId: string): Promise<string | null> {
  if (labelId === INBOX) return "Inbox";
  if (user.isDemo) return demoLabels().find((l) => l.id === labelId)?.name ?? null;
  const known = (await gmailLabels(user)).find((l) => l.id === labelId);
  if (known) return known.name;
  forgetLabels(user.id);
  return (await gmailLabels(user)).find((l) => l.id === labelId)?.name ?? null;
}

// The user's own Gmail labels (not system ones like INBOX or CATEGORY_*),
// with unread thread counts. labels.list has no counts, so each label is
// fetched: that's one call per label, so the counts are kept for UNREAD_TTL.
export async function listLabels(user: User): Promise<MailLabel[]> {
  if (user.isDemo) return demoLabels();
  const own = (await gmailLabels(user)).filter((l) => l.type === "user");
  const hit = unreadCache.get(user.id);
  let counts = hit && Date.now() - hit.at < UNREAD_TTL ? hit.counts : null;
  if (!counts || own.some((l) => !counts!.has(l.id))) {
    const gmail = gmailFor(user);
    const pairs = await mapLimited(own, async (l) => {
      const full = await withBackoff(() => gmail.users.labels.get({ userId: "me", id: l.id, fields: "threadsUnread" }));
      return [l.id, full.data.threadsUnread ?? 0] as const;
    });
    counts = new Map(pairs);
    if (unreadCache.size > 500) unreadCache.clear();
    unreadCache.set(user.id, { counts, at: Date.now() });
  }
  return own.map((l) => ({ id: l.id, name: l.name, unread: counts!.get(l.id) ?? 0, color: l.color })).sort((x, y) => x.name.localeCompare(y.name));
}

// Labels the app may add to or remove from a thread: the user's own labels, and
// INBOX (removing it archives). Other system labels (SPAM, TRASH, ...) are off limits.
export const isAssignableLabel = (id: string) => id === INBOX || id.startsWith("Label_");

// Move a whole thread to Gmail's Trash (recoverable there for 30 days), or back out.
export async function trashThread(user: User, threadId: string, trash: boolean): Promise<string[]> {
  if (user.isDemo) return trash ? demoModifyLabels(threadId, ["TRASH"], ["INBOX"]) : demoModifyLabels(threadId, ["INBOX"], ["TRASH"]);
  const gmail = gmailFor(user);
  const res = trash
    ? await gmail.users.threads.trash({ userId: "me", id: threadId })
    : await gmail.users.threads.untrash({ userId: "me", id: threadId });
  return [...new Set((res.data.messages ?? []).flatMap((m) => m.labelIds ?? []))];
}

// Apply and remove labels on a whole thread. Returns the thread's labels afterwards.
export async function modifyThreadLabels(user: User, threadId: string, add: string[], remove: string[]): Promise<string[]> {
  if (user.isDemo) return demoModifyLabels(threadId, add, remove);
  const res = await gmailFor(user).users.threads.modify({
    userId: "me",
    id: threadId,
    requestBody: { addLabelIds: add, removeLabelIds: remove },
  });
  return [...new Set((res.data.messages ?? []).flatMap((m) => m.labelIds ?? []))];
}

// A new Gmail label, which is also a new workspace. "Parent/Child" nests it.
// "Clients/JR" is a sub-label: each level is matched to an existing label
// whatever its case (so "clients/JR" lands under "Clients"), and any missing
// parent is created first so Gmail nests it. An existing label is reused.
export async function createLabel(user: User, name: string): Promise<MailLabel> {
  if (user.isDemo) return demoCreateLabel(name);
  const gmail = gmailFor(user);
  // A fresh list (not the cached one), so a label made in Gmail meanwhile is reused.
  forgetLabels(user.id);
  const existing = (await gmailLabels(user)).map((l) => ({ id: l.id, name: l.name }));
  const find = (path: string) => existing.find((l) => l.name.toLowerCase() === path.toLowerCase());
  let path = "";
  let label: { id: string; name: string } | undefined;
  for (const part of name.split("/")) {
    path = path ? `${path}/${part}` : part;
    label = find(path);
    if (!label) {
      const res = await gmail.users.labels.create({
        userId: "me",
        requestBody: { name: path, labelListVisibility: "labelShow", messageListVisibility: "show" },
      });
      label = { id: res.data.id!, name: res.data.name! };
      existing.push(label);
    }
    path = label.name; // keep the existing label's own casing for the next level
  }
  forgetLabels(user.id); // the new label shows everywhere straight away
  return { id: label!.id, name: label!.name, unread: 0 };
}

export async function getThread(user: User, threadId: string): Promise<ThreadDetail | null> {
  if (user.isDemo) return demoThreadDetail(threadId);

  const gmail = gmailFor(user);
  const t = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
  const messages = (t.data.messages ?? []).map((m) => ({
    id: m.id!,
    from: header(m, "From"),
    to: header(m, "To"),
    date: messageDate(m),
    subject: header(m, "Subject"),
    ...parseMessageParts(m.id!, m.payload),
  }));
  return { threadId, subject: messages[0]?.subject || "(no subject)", messages };
}

// Production hides the text of errors thrown from server actions, so mail
// failures are turned into messages the UI can show and act on.
export function mailErrorMessage(e: unknown): string {
  const err = e as { code?: unknown; status?: number; message?: string };
  const msg = err.message ?? "";
  if (/insufficient authentication scopes/i.test(msg))
    return "This needs Gmail access the app doesn't have yet. Sign out, then use “Reconnect it” on the sign-in page and tick the Gmail permission (“Read, compose and send emails”, or “View and modify”).";
  if (/invalid_grant/i.test(msg))
    return "Your Google sign-in has expired. Sign out, then use “Reconnect it” on the sign-in page.";
  if (/exists or conflicts/i.test(msg)) return "A Gmail label with that name already exists.";
  if (/has not been used|is disabled/i.test(msg))
    return "The Gmail API isn't enabled for this Google Cloud project. Enable it in the Google Cloud Console.";
  if (isRateLimited(e)) return "Gmail asked the app to slow down (too many requests this minute). Try again in a minute.";
  // Anything else (a Gmail hiccup, a timeout, a dropped database connection) is
  // passing: retrying fixes it, and reconnecting Google wouldn't. Only
  // invalid_grant above means the stored Google access has actually gone.
  if (/database|prisma|P10\d\d/i.test(msg)) return `Couldn't reach the app's database. Try again in a moment. (${errorDetail(e)})`;
  return `Couldn't load email from Gmail just now. Try again in a moment. (${errorDetail(e)})`;
}

// A short "why" from Google's response, so the message says what actually went
// wrong (the app is private to its owner, so this is safe to show).
function errorDetail(e: unknown): string {
  const err = e as {
    code?: unknown;
    status?: number;
    message?: string;
    response?: { status?: number; data?: { error?: string | { message?: string; status?: string }; error_description?: string } };
  };
  const status = err.response?.status ?? err.status ?? (typeof err.code === "number" ? err.code : undefined);
  const data = err.response?.data;
  const reason =
    (typeof data?.error === "object" ? data.error.message ?? data.error.status : data?.error) ??
    data?.error_description ??
    (typeof err.code === "string" ? err.code : undefined) ??
    err.message ??
    "unknown error";
  const short = String(reason).replace(/\s+/g, " ").slice(0, 140);
  return status ? `Google said ${status}: ${short}` : short;
}

function summarize(thread: gmail_v1.Schema$Thread): ThreadSummary {
  const messages = thread.messages ?? [];
  const first = messages[0];
  const last = messages[messages.length - 1];
  return {
    threadId: thread.id!,
    subject: (first && header(first, "Subject")) || "(no subject)",
    from: last ? header(last, "From") : "",
    snippet: decodeEntities(last?.snippet ?? ""),
    date: last ? messageDate(last) : new Date().toISOString(),
    unread: messages.some((m) => m.labelIds?.includes("UNREAD")),
    messageCount: messages.length,
    labelIds: [...new Set(messages.flatMap((m) => m.labelIds ?? []))],
    historyId: thread.historyId ?? undefined,
  };
}

function header(m: gmail_v1.Schema$Message, name: string) {
  return m.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function messageDate(m: gmail_v1.Schema$Message) {
  return new Date(Number(m.internalDate ?? Date.now())).toISOString();
}


function decodeEntities(s: string) {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Conversations the user started recently that aren't in the inbox (a new email
// they sent), newest first, so they can be put on the board like incoming mail.
export async function listStartedByMe(user: User, days = 14): Promise<ThreadSummary[]> {
  if (user.isDemo) return [];
  const me = user.email.toLowerCase();
  const addressOf = (v: string) => (v.match(/<([^>]+)>/)?.[1] ?? v).trim().toLowerCase();
  const gmail = gmailFor(user);
  const res = await gmail.users.threads.list({ userId: "me", q: `in:sent -in:inbox -in:chats -in:trash newer_than:${days}d`, maxResults: 25 });
  const found = await mapLimited(res.data.threads ?? [], async (ref) => {
    const t = await getThreadMeta(user, gmail, ref);
    const first = (t?.messages ?? []).find((m) => !m.labelIds?.includes("DRAFT"));
    return t && first && addressOf(header(first, "From")) === me ? summarize(t) : null;
  });
  return found.filter((t): t is ThreadSummary => t !== null);
}

// Sent mail still waiting for an answer: threads from the last few weeks whose
// newest message is the user's own (to someone else). Oldest first.
export type AwaitingReply = { threadId: string; messageId: string; subject: string; to: string[]; date: string; labelIds: string[] };
export async function listAwaitingReply(user: User, days = 30): Promise<AwaitingReply[]> {
  if (user.isDemo) return [];
  const me = user.email.toLowerCase();
  const addressOf = (v: string) => (v.match(/<([^>]+)>/)?.[1] ?? v).trim().toLowerCase();
  const gmail = gmailFor(user);
  const res = await gmail.users.threads.list({ userId: "me", q: `in:sent newer_than:${days}d -in:chats`, maxResults: 50 });
  const found = await mapLimited(res.data.threads ?? [], async (ref): Promise<AwaitingReply | null> => {
      const id = ref.id!;
      const t = await getThreadMeta(user, gmail, ref);
      if (!t) return null;
      // Drafts and trashed messages don't count as the last word.
      const msgs = (t.messages ?? []).filter((m) => !m.labelIds?.includes("DRAFT") && !m.labelIds?.includes("TRASH"));
      const last = msgs[msgs.length - 1];
      if (!last || addressOf(header(last, "From")) !== me) return null;
      const to = [header(last, "To"), header(last, "Cc")]
        .join(",")
        .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
        .map((x) => x.trim())
        .filter((x) => x && addressOf(x) !== me);
      if (to.length === 0) return null; // a note to self
      const labelIds = [...new Set(msgs.flatMap((m) => m.labelIds ?? []))];
      return { threadId: id, messageId: last.id!, subject: header(last, "Subject"), to, date: messageDate(last), labelIds };
  });
  return found.filter((x): x is AwaitingReply => x !== null).sort((a, b) => a.date.localeCompare(b.date));
}
