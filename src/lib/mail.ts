import "server-only";
import type { User } from "@prisma/client";
import type { gmail_v1 } from "googleapis";
import { gmailFor } from "./google";
import { demoLabels, demoThreadDetail, demoThreads } from "./demo-mail";

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

// Which slice of the mailbox the inbox column shows.
// "primary" matches Gmail's Primary inbox tab; "label:<id>" is one Gmail label.
export type MailView = "primary" | "inbox" | "unread" | `label:${string}`;

// Gmail nests labels by name: "Clients/Acme" sits under "Clients".
export type MailLabel = { id: string; name: string; unread: number };

export type MessageDetail = {
  id: string;
  from: string;
  to: string;
  date: string; // ISO
  subject: string;
  html: string | null;
  text: string | null;
};

export type ThreadDetail = { threadId: string; subject: string; messages: MessageDetail[] };

export async function listThreads(
  user: User,
  opts: { view?: MailView; query?: string; pageToken?: string } = {},
): Promise<{ threads: ThreadSummary[]; nextPageToken?: string }> {
  const view = opts.view ?? "primary";
  const query = opts.query?.trim();
  if (user.isDemo) return { threads: demoThreads(view, query) };

  // A search looks across all mail, like Gmail's search box. Spam and trash
  // are excluded by Gmail unless includeSpamTrash is set.
  const params: gmail_v1.Params$Resource$Users$Threads$List = { userId: "me", maxResults: 30, pageToken: opts.pageToken };
  if (query) params.q = query;
  else if (view.startsWith("label:")) params.labelIds = [view.slice("label:".length)];
  else params.q = VIEW_QUERIES[view as keyof typeof VIEW_QUERIES];

  const gmail = gmailFor(user);
  const res = await gmail.users.threads.list(params);
  const ids = (res.data.threads ?? []).map((t) => t.id!).filter(Boolean);
  const threads = await Promise.all(
    ids.map(async (id) => {
      const t = await gmail.users.threads.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date"],
      });
      return summarize(t.data);
    }),
  );
  return { threads, nextPageToken: res.data.nextPageToken ?? undefined };
}

const VIEW_QUERIES = {
  primary: "in:inbox category:primary",
  inbox: "in:inbox",
  unread: "in:inbox is:unread",
};

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
      return { id: l.id!, name: l.name!, unread: full.data.threadsUnread ?? 0 };
    }),
  );
  return labels.sort((x, y) => x.name.localeCompare(y.name));
}

export async function getThread(user: User, threadId: string): Promise<ThreadDetail | null> {
  if (user.isDemo) return demoThreadDetail(threadId);

  const gmail = gmailFor(user);
  const t = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
  const messages = (t.data.messages ?? []).map((m) => {
    const { html, text } = extractBodies(m.payload);
    return {
      id: m.id!,
      from: header(m, "From"),
      to: header(m, "To"),
      date: messageDate(m),
      subject: header(m, "Subject"),
      html,
      text,
    };
  });
  return { threadId, subject: messages[0]?.subject || "(no subject)", messages };
}

// Production hides the text of errors thrown from server actions, so mail
// failures are turned into messages the UI can show and act on.
export function mailErrorMessage(e: unknown): string {
  const err = e as { code?: unknown; status?: number; message?: string };
  const msg = err.message ?? "";
  if (/insufficient authentication scopes/i.test(msg))
    return "Gmail access wasn't granted. Sign out, sign in again and tick “View your email messages and settings”.";
  if (/invalid_grant/i.test(msg)) return "Your Google sign-in has expired. Sign out and sign in again.";
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

function extractBodies(part: gmail_v1.Schema$MessagePart | undefined): { html: string | null; text: string | null } {
  let html: string | null = null;
  let text: string | null = null;
  const walk = (p: gmail_v1.Schema$MessagePart | undefined) => {
    if (!p) return;
    if (p.body?.data && !p.filename) {
      const decoded = Buffer.from(p.body.data, "base64url").toString("utf8");
      if (p.mimeType === "text/html" && html === null) html = decoded;
      if (p.mimeType === "text/plain" && text === null) text = decoded;
    }
    p.parts?.forEach(walk);
  };
  walk(part);
  return { html, text };
}

function decodeEntities(s: string) {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
