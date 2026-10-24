"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  createLabel,
  getThread,
  isAssignableLabel,
  listLabels,
  modifyThreadLabels,
  listThreads,
  mailErrorMessage,
  summarizeThreads,
  type MailLabel,
  type ThreadDetail,
} from "@/lib/mail";
import { requireUser } from "@/lib/session";
import { isThemeId } from "@/lib/themes";
import type { BoardEmail, LaneDTO, NoteDTO, TaskDTO, ThreadSnapshot } from "@/lib/types";
import { emailInclude, snapshotData, toBoardEmail, upsertEmail } from "@/lib/board";

// ---------- ownership guards ----------

async function ownWorkspace(workspaceId: string) {
  const user = await requireUser();
  const workspace = await db.workspace.findFirst({ where: { id: workspaceId, userId: user.id } });
  if (!workspace) throw new Error("Workspace not found");
  return { user, workspace };
}

async function ownLane(laneId: string) {
  const user = await requireUser();
  const lane = await db.lane.findFirst({ where: { id: laneId, workspace: { userId: user.id } } });
  if (!lane) throw new Error("Lane not found");
  return { user, lane };
}

// Gmail's live metadata merged with the app's notes, tasks and "seen" state.
async function withStoredMeta(userId: string, live: Awaited<ReturnType<typeof summarizeThreads>>) {
  const stored = await db.email.findMany({
    where: { userId, threadId: { in: live.map((t) => t.threadId) } },
    include: emailInclude,
  });
  const byThread = new Map(stored.map((e) => [e.threadId, e]));
  return live.map((t) => toBoardEmail(byThread.get(t.threadId), t));
}

// ---------- mail ----------

type ListResult = { emails: BoardEmail[]; nextPageToken?: string; error?: string };

// One page of a label's emails. Errors come back as readable text because
// production hides the message of anything thrown from a server action.
export async function fetchLabelEmails(
  labelId: string,
  opts: { primaryOnly?: boolean; query?: string; pageToken?: string } = {},
): Promise<ListResult> {
  const user = await requireUser();
  try {
    const res = await listThreads(user, { labelId, ...opts });
    return { emails: await withStoredMeta(user.id, res.threads), nextPageToken: res.nextPageToken };
  } catch (e) {
    console.error("fetchLabelEmails failed", e);
    return { emails: [], error: mailErrorMessage(e) };
  }
}

// Fresh Gmail state for emails already on the board (placed in lanes), so new
// replies show even when the thread isn't on the first page of the label.
export async function refreshEmails(threadIds: string[]): Promise<{ emails: BoardEmail[]; error?: string }> {
  const user = await requireUser();
  if (threadIds.length === 0) return { emails: [] };
  try {
    const live = await summarizeThreads(user, threadIds);
    await Promise.all(
      live.map((t) => db.email.updateMany({ where: { userId: user.id, threadId: t.threadId }, data: snapshotData(t) })),
    );
    return { emails: await withStoredMeta(user.id, live) };
  } catch (e) {
    console.error("refreshEmails failed", e);
    return { emails: [], error: mailErrorMessage(e) };
  }
}

export async function fetchLabels(): Promise<{ labels: MailLabel[]; error?: string }> {
  const user = await requireUser();
  try {
    return { labels: await listLabels(user) };
  } catch (e) {
    console.error("fetchLabels failed", e);
    return { labels: [], error: mailErrorMessage(e) };
  }
}

// Opening a thread marks it as seen: a later message will show as a new reply.
export async function fetchThread(threadId: string): Promise<{ thread: ThreadDetail | null; error?: string }> {
  const user = await requireUser();
  try {
    const thread = await getThread(user, threadId);
    const last = thread?.messages[thread.messages.length - 1];
    if (thread && last) {
      const snippet = (last.text ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
      const snap = { threadId, subject: thread.subject, from: last.from, snippet, date: last.date };
      await db.email.upsert({
        where: { userId_threadId: { userId: user.id, threadId } },
        create: { userId: user.id, threadId, ...snapshotData(snap), lastSeenAt: new Date(last.date) },
        update: { from: last.from, date: new Date(last.date), lastSeenAt: new Date(last.date) },
      });
    }
    return { thread };
  } catch (e) {
    console.error("fetchThread failed", e);
    return { thread: null, error: mailErrorMessage(e) };
  }
}

// ---------- assigning emails to workspaces (Gmail labels) ----------

// Add an email to workspaces / take it out, by applying or removing Gmail labels.
export async function setEmailLabels(
  threadId: string,
  add: string[],
  remove: string[],
): Promise<{ labelIds?: string[]; error?: string }> {
  const user = await requireUser();
  if (![...add, ...remove].every(isAssignableLabel)) return { error: "That label can't be changed here." };
  try {
    const labelIds = await modifyThreadLabels(user, threadId, add, remove);
    // Leaving a label's workspace also takes the email out of that workspace's lanes.
    if (remove.length)
      await db.placement.deleteMany({
        where: { email: { userId: user.id, threadId }, workspace: { userId: user.id, labelId: { in: remove } } },
      });
    return { labelIds };
  } catch (e) {
    console.error("setEmailLabels failed", e);
    return { error: mailErrorMessage(e) };
  }
}

// Gmail label names: trim each "/"-separated part and drop empty ones.
const cleanLabelName = (name: string) =>
  name
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean)
    .join("/");

// A new workspace is a new Gmail label. "Clients/JR" nests it under Clients.
export async function createWorkspace(name: string): Promise<{ label?: MailLabel; error?: string }> {
  const user = await requireUser();
  const clean = cleanLabelName(name);
  if (!clean) return { error: "Give the label a name." };
  try {
    return { label: await createLabel(user, clean) };
  } catch (e) {
    console.error("createWorkspace failed", e);
    return { error: mailErrorMessage(e) };
  }
}

// Create a Gmail label (and so a new workspace) and apply it to an email.
export async function createLabelForEmail(
  threadId: string,
  name: string,
): Promise<{ label?: MailLabel; labelIds?: string[]; error?: string }> {
  const user = await requireUser();
  const clean = cleanLabelName(name);
  if (!clean) return { error: "Give the label a name." };
  try {
    const label = await createLabel(user, clean);
    const labelIds = await modifyThreadLabels(user, threadId, [label.id], []);
    return { label, labelIds };
  } catch (e) {
    console.error("createLabelForEmail failed", e);
    return { error: mailErrorMessage(e) };
  }
}

// ---------- lanes ----------

export async function createLane(workspaceId: string, name: string): Promise<LaneDTO> {
  await ownWorkspace(workspaceId);
  const count = await db.lane.count({ where: { workspaceId } });
  const lane = await db.lane.create({ data: { workspaceId, name: name.trim() || "New lane", position: count } });
  return { id: lane.id, name: lane.name, threadIds: [] };
}

export async function renameLane(laneId: string, name: string) {
  await ownLane(laneId);
  await db.lane.update({ where: { id: laneId }, data: { name: name.trim() || "Untitled" } });
}

// Deleting a lane sends its emails back to unsorted (their placements go with it).
export async function deleteLane(laneId: string) {
  await ownLane(laneId);
  await db.lane.delete({ where: { id: laneId } });
}

export async function reorderLanes(workspaceId: string, laneIds: string[]) {
  await ownWorkspace(workspaceId);
  await db.$transaction(
    laneIds.map((id, position) => db.lane.updateMany({ where: { id, workspaceId }, data: { position } })),
  );
}

// ---------- placing emails ----------

// Save the result of a drag (or a lane picked in the email panel):
// - `lanes`: the full email order of every lane that changed
// - `unsorted`: emails taken out of lanes, back to the label's unsorted list
// - `snapshots`: threads that may not have an Email record yet
export async function arrangeEmails(
  workspaceId: string,
  change: { lanes: { laneId: string; threadIds: string[] }[]; unsorted: string[]; snapshots: ThreadSnapshot[] },
) {
  const { user } = await ownWorkspace(workspaceId);
  const laneIds = change.lanes.map((l) => l.laneId);
  const owned = await db.lane.count({ where: { id: { in: laneIds }, workspaceId } });
  if (owned !== new Set(laneIds).size) throw new Error("Lane not found");

  for (const s of change.snapshots) await upsertEmail(user.id, s);
  const threadIds = [...change.unsorted, ...change.lanes.flatMap((l) => l.threadIds)];
  const emails = await db.email.findMany({ where: { userId: user.id, threadId: { in: threadIds } }, select: { id: true, threadId: true } });
  const idOf = new Map(emails.map((e) => [e.threadId, e.id]));

  await db.$transaction([
    db.placement.deleteMany({
      where: { workspaceId, emailId: { in: change.unsorted.map((t) => idOf.get(t)).filter((x): x is string => !!x) } },
    }),
    ...change.lanes.flatMap((l) =>
      l.threadIds
        .filter((t) => idOf.has(t))
        .map((t, position) =>
          db.placement.upsert({
            where: { workspaceId_emailId: { workspaceId, emailId: idOf.get(t)! } },
            create: { workspaceId, laneId: l.laneId, emailId: idOf.get(t)!, position },
            update: { laneId: l.laneId, position },
          }),
        ),
    ),
  ]);
}

// ---------- notes ----------

export async function addNote(thread: ThreadSnapshot, body: string): Promise<NoteDTO> {
  const user = await requireUser();
  const email = await upsertEmail(user.id, thread);
  const note = await db.note.create({ data: { emailId: email.id, body: body.trim() } });
  return { id: note.id, body: note.body, createdAt: note.createdAt.toISOString() };
}

export async function deleteNote(noteId: string) {
  const user = await requireUser();
  await db.note.deleteMany({ where: { id: noteId, email: { userId: user.id } } });
}

// ---------- tasks ----------

export async function addTask(thread: ThreadSnapshot, title: string, dueDate: string | null): Promise<TaskDTO> {
  const user = await requireUser();
  const email = await upsertEmail(user.id, thread);
  const count = await db.task.count({ where: { emailId: email.id } });
  const task = await db.task.create({
    data: { emailId: email.id, title: title.trim(), dueDate: dueDate ? new Date(dueDate) : null, position: count },
  });
  revalidatePath("/tasks");
  return { id: task.id, title: task.title, done: task.done, dueDate: task.dueDate?.toISOString() ?? null };
}

export async function updateTask(taskId: string, patch: { done?: boolean; title?: string; dueDate?: string | null }) {
  const user = await requireUser();
  await db.task.updateMany({
    where: { id: taskId, email: { userId: user.id } },
    data: {
      ...(patch.done !== undefined ? { done: patch.done } : {}),
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate ? new Date(patch.dueDate) : null } : {}),
    },
  });
  revalidatePath("/tasks");
}

export async function deleteTask(taskId: string) {
  const user = await requireUser();
  await db.task.deleteMany({ where: { id: taskId, email: { userId: user.id } } });
  revalidatePath("/tasks");
}

// ---------- preferences ----------

export async function saveTheme(theme: string) {
  const user = await requireUser();
  if (!isThemeId(theme)) return;
  await db.user.update({ where: { id: user.id }, data: { theme } });
}
