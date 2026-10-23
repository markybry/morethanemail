import "server-only";
import type { User } from "@prisma/client";
import type { gmail_v1 } from "googleapis";
import { gmailFor } from "./google";
import { demoThreadDetail, demoThreads } from "./demo-mail";

export type ThreadSummary = {
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  date: string; // ISO
  unread: boolean;
  messageCount: number;
};

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
  opts: { query?: string; pageToken?: string } = {},
): Promise<{ threads: ThreadSummary[]; nextPageToken?: string }> {
  if (user.isDemo) return { threads: demoThreads(opts.query) };

  const gmail = gmailFor(user);
  const res = await gmail.users.threads.list({
    userId: "me",
    q: opts.query?.trim() || "in:inbox",
    maxResults: 30,
    pageToken: opts.pageToken,
  });
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
