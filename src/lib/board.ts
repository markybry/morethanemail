import "server-only";
import type { Email, Note, Task, TicketLink, User } from "@prisma/client";
import { db } from "./db";
import { isLocalThread } from "./format";
import { getLabelName, INBOX, type ThreadSummary } from "./mail";
import { BUILT_IN_TEMPLATES, parseTemplateLanes } from "./laneTemplates";
import type { BoardEmail, LaneTemplateDTO, Lens, ThreadSnapshot, WorkspaceDTO } from "./types";

const threadFields = { threadId: true, subject: true, from: true, snippet: true, date: true, lastSeenAt: true, labelIds: true } as const;

export const emailInclude = {
  notes: { orderBy: { createdAt: "desc" } },
  tasks: { orderBy: { position: "asc" } },
  links: { orderBy: { createdAt: "asc" } },
  placements: { select: { workspaceId: true } },
  threads: { select: threadFields },
  parent: { select: { threadId: true } },
} as const;

type StoredThread = { threadId: string; subject: string; from: string; snippet: string; date: Date; lastSeenAt: Date | null; labelIds: string[] };
type EmailWithMeta = Email & {
  notes: Note[];
  tasks: Task[];
  links: TicketLink[];
  placements?: { workspaceId: string }[];
  threads?: StoredThread[];
  parent?: { threadId: string } | null;
};

// A thread has a new reply when its latest message is newer than the one last opened.
const isNewer = (date: string, seen: Date | null | undefined) => !!seen && new Date(date).getTime() > seen.getTime() + 1000;

// Combine what Gmail says now (if known) with what the app has stored.
export function toBoardEmail(stored: EmailWithMeta | undefined, live?: ThreadSummary): BoardEmail {
  const date = live?.date ?? stored!.date.toISOString();
  const first = {
    threadId: live?.threadId ?? stored!.threadId,
    subject: live?.subject ?? stored!.subject,
    from: live?.from ?? stored!.from,
    snippet: live?.snippet ?? stored!.snippet,
    date,
    newReply: isNewer(date, stored?.lastSeenAt),
    labelIds: live?.labelIds ?? stored?.labelIds ?? [],
  };
  const threads = [
    first,
    ...(stored?.threads ?? []).map((t) => ({
      threadId: t.threadId,
      subject: t.subject,
      from: t.from,
      snippet: t.snippet,
      date: t.date.toISOString(),
      newReply: isNewer(t.date.toISOString(), t.lastSeenAt),
      labelIds: t.labelIds,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return {
    threadId: first.threadId,
    subject: first.subject,
    from: first.from,
    snippet: first.snippet,
    date,
    unread: live?.unread ?? false,
    labelIds: first.labelIds,
    notes: stored?.notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString() })) ?? [],
    tasks:
      stored?.tasks.map((t) => ({ id: t.id, title: t.title, notes: t.notes, done: t.done, dueDate: t.dueDate?.toISOString() ?? null })) ?? [],
    links: stored?.links.map((l) => ({ id: l.id, url: l.url, title: l.title })) ?? [],
    newReply: threads.some((t) => t.newReply),
    local: isLocalThread(first.threadId),
    homeId: stored?.placements?.[0]?.workspaceId ?? null,
    title: stored?.title || first.subject,
    summary: stored?.summary ?? "",
    threads,
    partOf: stored?.parent?.threadId ?? null,
    hidden: !!stored?.hiddenAt && new Date(threads[0].date).getTime() <= stored.hiddenAt.getTime(),
  };
}

// Cards for Gmail threads (with what Gmail says now), plus any other cards by
// threadId from what's stored (tickets with no email, for example).
export async function boardEmailsFor(userId: string, live: ThreadSummary[], storedOnly: string[] = []): Promise<BoardEmail[]> {
  const ids = [...live.map((t) => t.threadId), ...storedOnly];
  const stored = await db.email.findMany({ where: { userId, threadId: { in: ids } }, include: emailInclude });
  const byThread = new Map(stored.map((e) => [e.threadId, e]));
  const out = live.map((t) => toBoardEmail(byThread.get(t.threadId), t));
  for (const id of storedOnly) {
    const s = byThread.get(id);
    if (s && !live.some((t) => t.threadId === id)) out.push(toBoardEmail(s));
  }
  return out;
}

// The card a thread belongs to: itself, or the card it was added to.
export async function cardThreadIdOf(userId: string, threadId: string): Promise<string> {
  const row = await db.email.findUnique({
    where: { userId_threadId: { userId, threadId } },
    select: { parent: { select: { threadId: true } } },
  });
  return row?.parent?.threadId ?? threadId;
}

export const snapshotData = (t: ThreadSnapshot) => ({
  subject: t.subject,
  from: t.from,
  snippet: t.snippet,
  date: new Date(t.date),
  ...(t.labelIds ? { labelIds: t.labelIds } : {}),
});

// Find or create the Email record for a thread the user is acting on.
export function upsertEmail(userId: string, t: ThreadSnapshot) {
  return db.email.upsert({
    where: { userId_threadId: { userId, threadId: t.threadId } },
    create: { userId, threadId: t.threadId, ...snapshotData(t) },
    update: snapshotData(t),
  });
}

// How long a finished card stays on the board.
export const FINISHED_SHOWN_DAYS = 14;

// The statuses a new main workflow starts with. Waiting and Done send a card
// back to the Inbox column when a reply arrives.
const DEFAULT_STATUSES = [
  { name: "To do", reopenOnReply: false },
  { name: "WIP", reopenOnReply: false },
  { name: "Waiting", reopenOnReply: true },
  { name: "Blocked", reopenOnReply: false },
  { name: "Done", reopenOnReply: true, finished: true },
];

// The main workflow (stored as the Inbox workspace), with default statuses the
// first time it is opened.
export async function ensureMainWorkflow(user: User) {
  const ws = await db.workspace.upsert({
    where: { userId_labelId: { userId: user.id, labelId: INBOX } },
    create: { userId: user.id, labelId: INBOX, name: "Inbox" },
    update: {},
    include: { _count: { select: { lanes: true } } },
  });
  if (ws._count.lanes === 0) {
    await db.lane.createMany({ data: DEFAULT_STATUSES.map((s, position) => ({ workspaceId: ws.id, position, ...s })) });
  }
  return ws;
}

// What opening a label shows: the workflow, seen through that label (Inbox shows
// it unfiltered). Nothing is created for the label. Null if there's no such label.
export async function resolveLabelView(
  user: User,
  labelId: string,
): Promise<{ workspaceId: string; lens: Lens | null } | null> {
  const name = labelId === INBOX ? "Inbox" : await getLabelName(user, labelId);
  if (name === null) return null;
  const main = await ensureMainWorkflow(user);
  return { workspaceId: main.id, lens: labelId === INBOX ? null : { labelId, name } };
}

// Built-in lane templates followed by the user's saved ones.
export async function loadLaneTemplates(userId: string): Promise<LaneTemplateDTO[]> {
  const saved = await db.laneTemplate.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  return [
    ...BUILT_IN_TEMPLATES,
    ...saved.map((t) => ({ id: t.id, name: t.name, builtIn: false, lanes: parseTemplateLanes(t.lanes) })),
  ];
}

// The workspace's lanes plus the stored state of every email placed in them.
export async function loadWorkspace(
  userId: string,
  workspaceId: string,
  lens: Lens | null = null,
): Promise<{ workspace: WorkspaceDTO; emails: Record<string, BoardEmail> }> {
  const ws = await db.workspace.findFirstOrThrow({
    where: { id: workspaceId, userId },
    include: {
      lanes: {
        orderBy: { position: "asc" },
        include: { placements: { orderBy: { position: "asc" }, include: { email: { include: emailInclude } } } },
      },
    },
  });
  // Finished cards drop off the board two weeks after they got there (they're
  // still found through their labels, Recent and search).
  const cutoff = Date.now() - FINISHED_SHOWN_DAYS * 86_400_000;
  const lanes = ws.lanes.map((l) => ({
    ...l,
    shown: l.placements.filter((p) => !(l.finished && p.movedAt.getTime() < cutoff)),
  }));
  const placedIds = new Set(ws.lanes.flatMap((l) => l.placements.map((p) => p.email.threadId)));
  const emails: Record<string, BoardEmail> = {};
  for (const l of lanes) for (const p of l.shown) emails[p.email.threadId] = toBoardEmail(p.email);
  // Tickets with no email: Gmail doesn't list them, so unplaced ones come from here.
  const tickets = await db.email.findMany({ where: { userId, workspaceId }, include: emailInclude, orderBy: { date: "desc" } });
  const ticketIds = tickets.filter((t) => !placedIds.has(t.threadId)).map((t) => t.threadId);
  for (const t of tickets) if (!placedIds.has(t.threadId) || emails[t.threadId]) emails[t.threadId] = toBoardEmail(t);
  return {
    workspace: {
      id: ws.id,
      labelId: ws.labelId,
      name: ws.name,
      lanes: lanes.map((l) => ({
        id: l.id,
        name: l.name,
        reopenOnReply: l.reopenOnReply,
        finished: l.finished,
        threadIds: l.shown.map((p) => p.email.threadId),
        since: Object.fromEntries(l.shown.map((p) => [p.email.threadId, p.movedAt.toISOString()])),
      })),
      ticketIds,
      lens,
    },
    emails,
  };
}
