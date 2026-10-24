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
};

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

// One page of a label's threads. For the inbox, primaryOnly matches Gmail's
// Primary tab. A query narrows within the label. Gmail leaves out spam and trash.
export async function listThreads(
  user: User,
  opts: { labelId: string; primaryOnly?: boolean; query?: string; pageToken?: string },
): Promise<{ threads: ThreadSummary[]; nextPageToken?: string }> {
  const query = opts.query?.trim();
  const primaryOnly = opts.labelId === INBOX && !!opts.primaryOnly;
  if (user.isDemo) return { threads: demoThreads(opts.labelId, primaryOnly, query) };

  const q = [primaryOnly ? "category:primary" : "", query ?? ""].filter(Boolean).join(" ");
  const gmail = gmailFor(user);
  const res = await gmail.users.threads.list({
    userId: "me",
    labelIds: [opts.labelId],
    q: q || undefined,
    maxResults: 30,
    pageToken: opts.pageToken,
  });
  const ids = (res.data.threads ?? []).map((t) => t.id!).filter(Boolean);
  return { threads: await summarizeThreads(user, ids), nextPageToken: res.data.nextPageToken ?? undefined };
}

// Current metadata for specific threads. Threads that no longer exist are left out.
export async function summarizeThreads(user: User, threadIds: string[]): Promise<ThreadSummary[]> {
  if (user.isDemo) return demoThreads().filter((t) => threadIds.includes(t.threadId));
  const gmail = gmailFor(user);
  const results = await Promise.all(
    threadIds.map(async (id) => {
      try {
        const t = await gmail.users.threads.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "Date"],
        });
        return summarize(t.data);
      } catch (e) {
        if ((e as { code?: number }).code === 404) return null;
        throw e;
      }
    }),
  );
  return results.filter((t): t is ThreadSummary => t !== null);
}

// The label's display name, or null if the user has no such label.
export async function getLabelName(user: User, labelId: string): Promise<string | null> {
  if (labelId === INBOX) return "Inbox";
  if (user.isDemo) return demoLabels().find((l) => l.id === labelId)?.name ?? null;
  try {
    const res = await gmailFor(user).users.labels.get({ userId: "me", id: labelId, fields: "name" });
    return res.data.name ?? null;
  } catch (e) {
    if ((e as { code?: number }).code === 404) return null;
    throw e;
  }
}

// The user's own Gmail labels (not system ones like INBOX or CATEGORY_*),
// with unread thread counts. labels.list has no counts, so each label is fetched.
export async function listLabels(user: User): Promise<MailLabel[]> {
  if (user.isDemo) return demoLabels();
  const gmail = gmailFor(user);
  const res = await gmail.users.labels.list({ userId: "me" });
  const own = (res.data.labels ?? []).filter((l) => l.type === "user" && l.id && l.name);
  const labels = await Promise.all(
    own.map(async (l) => {
      const full = await gmail.users.labels.get({ userId: "me", id: l.id!, fields: "threadsUnread" });
      return { id: l.id!, name: l.name!, unread: full.data.threadsUnread ?? 0, color: l.color?.backgroundColor ?? undefined };
    }),
  );
  return labels.sort((x, y) => x.name.localeCompare(y.name));
}

// Labels the app may add to or remove from a thread: the user's own labels, and
// INBOX (removing it archives). Other system labels (SPAM, TRASH, ...) are off limits.
export const isAssignableLabel = (id: string) => id === INBOX || id.startsWith("Label_");

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
export async function createLabel(user: User, name: string): Promise<MailLabel> {
  if (user.isDemo) return demoCreateLabel(name);
  const res = await gmailFor(user).users.labels.create({
    userId: "me",
    requestBody: { name, labelListVisibility: "labelShow", messageListVisibility: "show" },
  });
  return { id: res.data.id!, name: res.data.name!, unread: 0 };
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
    return "This needs Gmail access the app doesn't have yet. Sign out, sign in again and tick the Gmail permission (“Read, compose and send emails”, or “View and modify”).";
  if (/invalid_grant/i.test(msg)) return "Your Google sign-in has expired. Sign out and sign in again.";
  if (/exists or conflicts/i.test(msg)) return "A Gmail label with that name already exists.";
  if (/has not been used|is disabled/i.test(msg))
    return "The Gmail API isn't enabled for this Google Cloud project. Enable it in the Google Cloud Console.";
  if (err.status === 429 || err.code === 429) return "Gmail is rate-limiting requests. Try again in a minute.";
  return "Couldn't load email from Gmail. Try again, or sign out and back in.";
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
