import "server-only";
import type { Email, Note, Task, User } from "@prisma/client";
import { db } from "./db";
import { isLocalThread } from "./format";
import { getLabelName, type ThreadSummary } from "./mail";
import { BUILT_IN_TEMPLATES, parseTemplateLanes } from "./laneTemplates";
import type { BoardEmail, LaneTemplateDTO, ThreadSnapshot, WorkspaceDTO } from "./types";

export const emailInclude = {
  notes: { orderBy: { createdAt: "desc" } },
  tasks: { orderBy: { position: "asc" } },
} as const;

type EmailWithMeta = Email & { notes: Note[]; tasks: Task[] };

// Combine what Gmail says now (if known) with what the app has stored.
export function toBoardEmail(stored: EmailWithMeta | undefined, live?: ThreadSummary): BoardEmail {
  const date = live?.date ?? stored!.date.toISOString();
  const lastSeen = stored?.lastSeenAt?.getTime();
  return {
    threadId: live?.threadId ?? stored!.threadId,
    subject: live?.subject ?? stored!.subject,
    from: live?.from ?? stored!.from,
    snippet: live?.snippet ?? stored!.snippet,
    date,
    unread: live?.unread ?? false,
    labelIds: live?.labelIds ?? [],
    notes: stored?.notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString() })) ?? [],
    tasks:
      stored?.tasks.map((t) => ({ id: t.id, title: t.title, done: t.done, dueDate: t.dueDate?.toISOString() ?? null })) ?? [],
    newReply: lastSeen !== undefined && new Date(date).getTime() > lastSeen + 1000,
    local: isLocalThread(live?.threadId ?? stored!.threadId),
  };
}

export const snapshotData = (t: ThreadSnapshot) => ({
  subject: t.subject,
  from: t.from,
  snippet: t.snippet,
  date: new Date(t.date),
});

// Find or create the Email record for a thread the user is acting on.
export function upsertEmail(userId: string, t: ThreadSnapshot) {
  return db.email.upsert({
    where: { userId_threadId: { userId, threadId: t.threadId } },
    create: { userId, threadId: t.threadId, ...snapshotData(t) },
    update: snapshotData(t),
  });
}

// A label's workspace, created the first time the label is opened.
// Returns null if the user has no such Gmail label.
export async function ensureWorkspace(user: User, labelId: string) {
  const existing = await db.workspace.findUnique({ where: { userId_labelId: { userId: user.id, labelId } } });
  if (existing) return existing;
  const name = await getLabelName(user, labelId);
  if (name === null) return null;
  return db.workspace.upsert({
    where: { userId_labelId: { userId: user.id, labelId } },
    create: { userId: user.id, labelId, name },
    update: {},
  });
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
  const emails: Record<string, BoardEmail> = {};
  for (const l of ws.lanes) for (const p of l.placements) emails[p.email.threadId] = toBoardEmail(p.email);
  // Tickets with no email: Gmail doesn't list them, so unplaced ones come from here.
  const tickets = await db.email.findMany({ where: { userId, workspaceId }, include: emailInclude, orderBy: { date: "desc" } });
  const ticketIds = tickets.filter((t) => !emails[t.threadId]).map((t) => t.threadId);
  for (const t of tickets) emails[t.threadId] = toBoardEmail(t);
  return {
    workspace: {
      id: ws.id,
      labelId: ws.labelId,
      name: ws.name,
      lanes: ws.lanes.map((l) => ({ id: l.id, name: l.name, reopenOnReply: l.reopenOnReply, threadIds: l.placements.map((p) => p.email.threadId) })),
      ticketIds,
    },
    emails,
  };
}
