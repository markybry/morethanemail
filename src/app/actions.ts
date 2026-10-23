"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getThread, listThreads, mailErrorMessage, type ThreadDetail, type ThreadSummary } from "@/lib/mail";
import { requireUser } from "@/lib/session";
import type { CardDTO, CaseOption, FiledInfo, LaneOption } from "@/lib/types";
import { cardInclude, newProject, toCardDTO } from "@/lib/board";

// ---------- ownership guards ----------

async function ownProject(projectId: string) {
  const user = await requireUser();
  const project = await db.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) throw new Error("Project not found");
  return { user, project };
}

async function ownLane(laneId: string) {
  const user = await requireUser();
  const lane = await db.lane.findFirst({ where: { id: laneId, project: { userId: user.id } } });
  if (!lane) throw new Error("Lane not found");
  return { user, lane };
}

async function ownCard(cardId: string) {
  const user = await requireUser();
  const card = await db.card.findFirst({ where: { id: cardId, userId: user.id } });
  if (!card) throw new Error("Case not found");
  return { user, card };
}

const loadCard = async (id: string) => toCardDTO(await db.card.findUniqueOrThrow({ where: { id }, include: cardInclude }));

const emailData = (t: ThreadSummary) => ({
  subject: t.subject,
  from: t.from,
  snippet: t.snippet,
  emailDate: new Date(t.date),
});

// ---------- mail ----------

type InboxResult = {
  threads: ThreadSummary[];
  nextPageToken?: string;
  filed: Record<string, FiledInfo>;
  error?: string;
};

export async function fetchInbox(query?: string, pageToken?: string): Promise<InboxResult> {
  const user = await requireUser();
  let result: Awaited<ReturnType<typeof listThreads>>;
  try {
    result = await listThreads(user, { query, pageToken });
  } catch (e) {
    console.error("fetchInbox failed", e);
    return { threads: [], filed: {}, error: mailErrorMessage(e) };
  }
  const links = await db.cardEmail.findMany({
    where: { userId: user.id, threadId: { in: result.threads.map((t) => t.threadId) } },
    select: {
      threadId: true,
      card: { select: { id: true, title: true, lane: { select: { name: true, project: { select: { id: true, name: true } } } } } },
    },
  });
  const filed: Record<string, FiledInfo> = Object.fromEntries(
    links.map((l) => [
      l.threadId,
      {
        cardId: l.card.id,
        cardTitle: l.card.title,
        projectId: l.card.lane.project.id,
        projectName: l.card.lane.project.name,
        laneName: l.card.lane.name,
      },
    ]),
  );
  return { ...result, filed };
}

export async function fetchThread(threadId: string): Promise<{ thread: ThreadDetail | null; error?: string }> {
  const user = await requireUser();
  try {
    return { thread: await getThread(user, threadId) };
  } catch (e) {
    console.error("fetchThread failed", e);
    return { thread: null, error: mailErrorMessage(e) };
  }
}

// Everything the "move to" and "attach to" pickers need.
export async function fetchPickers(): Promise<{ lanes: LaneOption[]; cases: CaseOption[] }> {
  const user = await requireUser();
  const projects = await db.project.findMany({
    where: { userId: user.id },
    orderBy: { position: "asc" },
    include: {
      lanes: {
        orderBy: { position: "asc" },
        include: { cards: { orderBy: { position: "asc" }, select: { id: true, title: true } } },
      },
    },
  });
  const lanes: LaneOption[] = [];
  const cases: CaseOption[] = [];
  for (const p of projects)
    for (const l of p.lanes) {
      lanes.push({ id: l.id, name: l.name, projectId: p.id, projectName: p.name });
      for (const c of l.cards) cases.push({ id: c.id, title: c.title, projectId: p.id, projectName: p.name, laneName: l.name });
    }
  return { lanes, cases };
}

// ---------- projects ----------

export async function createProject(name: string) {
  const user = await requireUser();
  const project = await newProject(user.id, name);
  revalidatePath("/", "layout");
  return project.id;
}

export async function renameProject(projectId: string, name: string) {
  await ownProject(projectId);
  await db.project.update({ where: { id: projectId }, data: { name: name.trim() || "Untitled project" } });
  revalidatePath("/", "layout");
}

export async function deleteProject(projectId: string) {
  await ownProject(projectId);
  await db.project.delete({ where: { id: projectId } });
  revalidatePath("/", "layout");
}

// ---------- lanes ----------

export async function createLane(projectId: string, name: string) {
  await ownProject(projectId);
  const count = await db.lane.count({ where: { projectId } });
  const lane = await db.lane.create({ data: { projectId, name: name.trim() || "New lane", position: count } });
  return { id: lane.id, name: lane.name, cards: [] as CardDTO[] };
}

export async function renameLane(laneId: string, name: string) {
  await ownLane(laneId);
  await db.lane.update({ where: { id: laneId }, data: { name: name.trim() || "Untitled" } });
}

export async function deleteLane(laneId: string) {
  await ownLane(laneId);
  await db.lane.delete({ where: { id: laneId } });
}

export async function reorderLanes(projectId: string, laneIds: string[]) {
  await ownProject(projectId);
  await db.$transaction(
    laneIds.map((id, position) => db.lane.updateMany({ where: { id, projectId }, data: { position } })),
  );
}

// ---------- cases ----------

async function saveLaneOrder(userId: string, laneId: string, cardIds: string[]) {
  await db.$transaction(
    cardIds.map((id, position) => db.card.updateMany({ where: { id, userId }, data: { laneId, position } })),
  );
}

async function appendToLane(userId: string, cardId: string, laneId: string) {
  const last = await db.card.findFirst({ where: { laneId }, orderBy: { position: "desc" }, select: { position: true } });
  await db.card.updateMany({ where: { id: cardId, userId }, data: { laneId, position: (last?.position ?? -1) + 1 } });
}

// Drop an email onto a lane. A thread already in a case moves that whole case;
// otherwise a new case is opened for it. `orderedCardIds` uses `email:<threadId>`
// as the placeholder for where the dropped email landed.
export async function fileEmail(laneId: string, thread: ThreadSummary, orderedCardIds: string[]): Promise<CardDTO> {
  const { user } = await ownLane(laneId);
  const existing = await db.cardEmail.findUnique({
    where: { userId_threadId: { userId: user.id, threadId: thread.threadId } },
  });
  let cardId: string;
  if (existing) {
    cardId = existing.cardId;
    await db.cardEmail.update({ where: { id: existing.id }, data: emailData(thread) });
  } else {
    const card = await db.card.create({
      data: {
        userId: user.id,
        laneId,
        title: thread.subject,
        emails: { create: { userId: user.id, threadId: thread.threadId, ...emailData(thread) } },
      },
    });
    cardId = card.id;
  }
  const ids = orderedCardIds.map((id) => (id === `email:${thread.threadId}` ? cardId : id)).filter((id, i, a) => a.indexOf(id) === i);
  if (!ids.includes(cardId)) ids.push(cardId);
  await saveLaneOrder(user.id, laneId, ids);
  revalidatePath("/", "layout");
  return loadCard(cardId);
}

// Open an empty case by hand (no email yet).
export async function createCase(laneId: string, title: string) {
  const { user } = await ownLane(laneId);
  const card = await db.card.create({ data: { userId: user.id, laneId, title: title.trim() || "New case", position: 0 } });
  await appendToLane(user.id, card.id, laneId);
  return loadCard(card.id);
}

export async function renameCase(cardId: string, title: string) {
  await ownCard(cardId);
  await db.card.update({ where: { id: cardId }, data: { title: title.trim() || "Untitled case" } });
  revalidatePath("/", "layout");
}

// Persist the full card order for one or more lanes after a drag.
export async function moveCards(lanes: { laneId: string; cardIds: string[] }[]) {
  const user = await requireUser();
  for (const { laneId } of lanes) await ownLane(laneId);
  for (const { laneId, cardIds } of lanes) await saveLaneOrder(user.id, laneId, cardIds);
}

// Move a case to any lane in any project.
export async function moveCaseTo(cardId: string, laneId: string) {
  const { user } = await ownCard(cardId);
  await ownLane(laneId);
  await appendToLane(user.id, cardId, laneId);
  revalidatePath("/", "layout");
  return loadCard(cardId);
}

// A case has outgrown a card: give it its own project board.
// The case itself moves onto the new board so nothing is copied or lost.
export async function promoteToProject(cardId: string) {
  const { user, card } = await ownCard(cardId);
  const project = await newProject(user.id, card.title, card.id);
  await appendToLane(user.id, cardId, project.lanes[0].id);
  revalidatePath("/", "layout");
  return project.id;
}

export async function removeCard(cardId: string) {
  await ownCard(cardId);
  await db.card.delete({ where: { id: cardId } });
  revalidatePath("/", "layout");
}

// ---------- emails on a case ----------

// Link an inbox thread to an existing case (moving it off any other case).
export async function attachEmail(cardId: string, thread: ThreadSummary) {
  const { user } = await ownCard(cardId);
  await db.cardEmail.upsert({
    where: { userId_threadId: { userId: user.id, threadId: thread.threadId } },
    create: { userId: user.id, cardId, threadId: thread.threadId, ...emailData(thread) },
    update: { cardId, ...emailData(thread) },
  });
  revalidatePath("/", "layout");
  return loadCard(cardId);
}

export async function detachEmail(cardEmailId: string) {
  const user = await requireUser();
  await db.cardEmail.deleteMany({ where: { id: cardEmailId, userId: user.id } });
  revalidatePath("/", "layout");
}

// Pull one email out of a case into a new case of its own, in the same lane.
export async function splitEmail(cardEmailId: string) {
  const user = await requireUser();
  const link = await db.cardEmail.findFirst({ where: { id: cardEmailId, userId: user.id }, include: { card: true } });
  if (!link) throw new Error("Email not found");
  const card = await db.card.create({ data: { userId: user.id, laneId: link.card.laneId, title: link.subject } });
  await db.cardEmail.update({ where: { id: link.id }, data: { cardId: card.id } });
  await appendToLane(user.id, card.id, link.card.laneId);
  revalidatePath("/", "layout");
  return { from: await loadCard(link.cardId), created: await loadCard(card.id) };
}

// ---------- notes ----------

export async function addNote(cardId: string, body: string) {
  await ownCard(cardId);
  const note = await db.note.create({ data: { cardId, body: body.trim() } });
  return { id: note.id, body: note.body, createdAt: note.createdAt.toISOString() };
}

export async function deleteNote(noteId: string) {
  const user = await requireUser();
  await db.note.deleteMany({ where: { id: noteId, card: { userId: user.id } } });
}

// ---------- tasks ----------

export async function addTask(cardId: string, title: string, dueDate: string | null) {
  await ownCard(cardId);
  const count = await db.task.count({ where: { cardId } });
  const task = await db.task.create({
    data: { cardId, title: title.trim(), dueDate: dueDate ? new Date(dueDate) : null, position: count },
  });
  revalidatePath("/tasks");
  return { id: task.id, title: task.title, done: task.done, dueDate: task.dueDate?.toISOString() ?? null };
}

export async function updateTask(taskId: string, patch: { done?: boolean; title?: string; dueDate?: string | null }) {
  const user = await requireUser();
  await db.task.updateMany({
    where: { id: taskId, card: { userId: user.id } },
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
  await db.task.deleteMany({ where: { id: taskId, card: { userId: user.id } } });
  revalidatePath("/tasks");
}
