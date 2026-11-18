"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  createLabel,
  getThread,
  isAssignableLabel,
  labelWithSubLabels,
  trashThread,
  listLabels,
  modifyThreadLabels,
  listThreads,
  mailErrorMessage,
  summarizeThreads,
  listAwaitingReply,
  type MailLabel,
  type ThreadDetail,
} from "@/lib/mail";
import { requireUser } from "@/lib/session";
import { isThemeId } from "@/lib/themes";
import type { BoardEmail, FiledCard, LaneDTO, LaneTemplateDTO, LinkDTO, NoteDTO, TaskDTO, TemplateLane, ThreadSnapshot } from "@/lib/types";
import { parseTemplateLanes } from "@/lib/laneTemplates";
import { isLocalThread, LOCAL_PREFIX } from "@/lib/format";
import { randomUUID } from "crypto";
import { boardEmailsFor, emailInclude, snapshotData, toBoardEmail, upsertEmail } from "@/lib/board";

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
const withStoredMeta = (userId: string, live: Awaited<ReturnType<typeof summarizeThreads>>) => boardEmailsFor(userId, live);

// Board pages are cached in the browser's router; after a lane or placement
// change, drop that cache so going back to a board shows what was saved.
const revalidateBoards = () => revalidatePath("/l/[labelId]", "page");

// ---------- mail ----------

type ListResult = { emails: BoardEmail[]; nextPageToken?: string; error?: string };

// One page of a label's emails, its sub-labels' included; "ALL" for the Inbox
// plus everything labelled, newest first. Errors come back as readable text because production hides the
// message of anything thrown from a server action.
// Labelled mail from before the user's "done" cut-off is left out (not the
// Inbox's), unless includeOlder; a search always looks at everything.
export async function fetchLabelEmails(
  labelId: string,
  opts: { primaryOnly?: boolean; query?: string; pageToken?: string; includeOlder?: boolean } = {},
): Promise<ListResult> {
  const user = await requireUser();
  try {
    const labels = labelId === "ALL" ? undefined : await labelWithSubLabels(user, labelId);
    // "Clear queue": mail with nothing newer than this stays out of the first column.
    const useCutoff = labelId !== "ALL" && !opts.includeOlder && !opts.query?.trim() && !!user.triageFrom;
    const res = await listThreads(user, {
      labels,
      inboxOrLabelled: labelId === "ALL",
      after: useCutoff ? user.triageFrom! : undefined,
      primaryOnly: opts.primaryOnly,
      query: opts.query,
      pageToken: opts.pageToken,
      // Ignored senders stay out of the Inbox column (a search still finds them).
      excludeFrom: labelId === "INBOX" && !opts.query?.trim() ? user.ignoredSenders : undefined,
    });
    return { emails: await withStoredMeta(user.id, res.threads), nextPageToken: res.nextPageToken };
  } catch (e) {
    console.error("fetchLabelEmails failed", e);
    return { emails: [], error: mailErrorMessage(e) };
  }
}

// Fresh Gmail state for cards already on the board (placed in lanes), and every
// thread on them, so new replies show even when a thread isn't on the first page
// of the label. A thread that was added to a card comes back as that card.
export async function refreshEmails(threadIds: string[]): Promise<{ emails: BoardEmail[]; error?: string }> {
  const user = await requireUser();
  if (threadIds.length === 0) return { emails: [] };
  try {
    const rows = await db.email.findMany({
      where: { userId: user.id, threadId: { in: threadIds } },
      select: { threadId: true, parent: { select: { threadId: true } } },
    });
    const parentOf = new Map(rows.map((r) => [r.threadId, r.parent?.threadId]));
    const cardIds = [...new Set(threadIds.map((t) => parentOf.get(t) ?? t))];
    const cards = await db.email.findMany({
      where: { userId: user.id, threadId: { in: cardIds } },
      select: { threadId: true, threads: { select: { threadId: true } } },
    });
    const all = [...new Set([...cardIds, ...cards.flatMap((c) => c.threads.map((t) => t.threadId))])].filter((t) => !isLocalThread(t));
    const live = all.length ? await summarizeThreads(user, all) : [];
    await Promise.all(
      live.map((t) =>
        db.email.updateMany({ where: { userId: user.id, threadId: t.threadId }, data: { ...snapshotData(t), labelIds: t.labelIds } }),
      ),
    );
    return {
      emails: await boardEmailsFor(
        user.id,
        live.filter((t) => cardIds.includes(t.threadId)),
        cardIds.filter((t) => isLocalThread(t)),
      ),
    };
  } catch (e) {
    console.error("refreshEmails failed", e);
    return { emails: [], error: mailErrorMessage(e) };
  }
}

// Search all mail, for adding an older email to a card.
export async function searchMail(query: string): Promise<ListResult> {
  const user = await requireUser();
  if (!query.trim()) return { emails: [] };
  try {
    const res = await listThreads(user, { query: query.trim() });
    return { emails: await withStoredMeta(user.id, res.threads) };
  } catch (e) {
    console.error("searchMail failed", e);
    return { emails: [], error: mailErrorMessage(e) };
  }
}

// The search bar: all mail (Gmail's own search, so from:, subject:, has:attachment
// and the rest work), plus cards whose title, summary, notes or tasks match.
export type CardHit = { threadId: string; title: string; from: string; date: string; local: boolean; where: string };
export async function searchEverything(
  query: string,
  pageToken?: string,
): Promise<{ emails: BoardEmail[]; cards: CardHit[]; nextPageToken?: string; error?: string }> {
  const user = await requireUser();
  const q = query.trim().slice(0, 500);
  if (!q) return { emails: [], cards: [] };
  const contains = { contains: q, mode: "insensitive" as const };
  const cardsQuery = pageToken
    ? Promise.resolve([])
    : db.email.findMany({
        where: {
          userId: user.id,
          parentId: null,
          OR: [
            { title: contains },
            { summary: contains },
            { workspaceId: { not: null }, snippet: contains }, // a ticket's description
            { notes: { some: { body: contains } } },
            { tasks: { some: { title: contains } } },
          ],
        },
        orderBy: { date: "desc" },
        take: 20,
        select: { threadId: true, title: true, subject: true, from: true, date: true, workspaceId: true, summary: true, notes: { where: { body: contains }, take: 1, select: { body: true } }, tasks: { where: { title: contains }, take: 1, select: { title: true } } },
      });
  try {
    const [res, stored] = await Promise.all([listThreads(user, { query: q, pageToken }), cardsQuery]);
    const cards = stored.map((c) => ({
      threadId: c.threadId,
      title: c.title || c.subject,
      from: c.from,
      date: c.date.toISOString(),
      local: c.workspaceId !== null,
      where: c.tasks[0] ? `Task: ${c.tasks[0].title}` : c.notes[0] ? `Note: ${c.notes[0].body}` : c.summary,
    }));
    return { emails: await withStoredMeta(user.id, res.threads), cards, nextPageToken: res.nextPageToken };
  } catch (e) {
    console.error("searchEverything failed", e);
    return { emails: [], cards: [], error: mailErrorMessage(e) };
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
  if (isLocalThread(threadId)) return { thread: null };
  try {
    const thread = await getThread(user, threadId);
    const last = thread?.messages[thread.messages.length - 1];
    if (thread && last) {
      const snippet = (last.text ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
      const snap = { threadId, subject: thread.subject, from: last.from, snippet, date: last.date };
      await db.email.upsert({
        where: { userId_threadId: { userId: user.id, threadId } },
        create: { userId: user.id, threadId, ...snapshotData(snap), lastSeenAt: new Date(last.date), openedAt: new Date() },
        update: { from: last.from, date: new Date(last.date), lastSeenAt: new Date(last.date), openedAt: new Date() },
      });
    }
    return { thread };
  } catch (e) {
    console.error("fetchThread failed", e);
    return { thread: null, error: mailErrorMessage(e) };
  }
}

// ---------- labels ----------

// Apply or remove Gmail labels on an email. Its status stays as it is: labels
// say what a card is about, statuses say where it's up to.
export async function setEmailLabels(
  threadId: string,
  add: string[],
  remove: string[],
): Promise<{ labelIds?: string[]; error?: string }> {
  const user = await requireUser();
  if (![...add, ...remove].every(isAssignableLabel)) return { error: "That label can't be changed here." };
  if (isLocalThread(threadId)) {
    // A ticket with no email keeps its labels in the app only.
    const row = await db.email.findUnique({ where: { userId_threadId: { userId: user.id, threadId } } });
    if (!row) return { error: "That ticket no longer exists." };
    const labelIds = [...new Set([...row.labelIds.filter((l) => !remove.includes(l)), ...add.filter((l) => l !== "INBOX")])];
    await db.email.update({ where: { id: row.id }, data: { labelIds } });
    revalidateBoards();
    return { labelIds };
  }
  try {
    const labelIds = await modifyThreadLabels(user, threadId, add, remove);
    await db.email.updateMany({ where: { userId: user.id, threadId }, data: { labelIds } });
    revalidateBoards();
    return { labelIds };
  } catch (e) {
    console.error("setEmailLabels failed", e);
    return { error: mailErrorMessage(e) };
  }
}

// Gmail label names: trim each "/"-separated part and drop empty ones.
const cleanLabelName = (name: string) =>
  name
    .replace(/\\/g, "/") // "Clients\JR" is meant as a sub-label too
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean)
    .join("/");

// A new Gmail label. "Clients/JR" nests it under Clients.
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

// Create a Gmail label and apply it to an email.
export async function createLabelForEmail(
  threadId: string,
  name: string,
): Promise<{ label?: MailLabel; labelIds?: string[]; error?: string }> {
  const user = await requireUser();
  const clean = cleanLabelName(name);
  if (!clean) return { error: "Give the label a name." };
  if (isLocalThread(threadId)) return { error: "This ticket has no email, so it has no Gmail labels." };
  try {
    const label = await createLabel(user, clean);
    const labelIds = await modifyThreadLabels(user, threadId, [label.id], []);
    await db.email.updateMany({ where: { userId: user.id, threadId }, data: { labelIds } });
    revalidateBoards();
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
  revalidateBoards();
  return { id: lane.id, name: lane.name, reopenOnReply: lane.reopenOnReply, finished: lane.finished, threadIds: [], since: {} };
}

export async function renameLane(laneId: string, name: string) {
  await ownLane(laneId);
  await db.lane.update({ where: { id: laneId }, data: { name: name.trim() || "Untitled" } });
  revalidateBoards();
}

export async function setLaneReopenOnReply(laneId: string, reopenOnReply: boolean) {
  await ownLane(laneId);
  await db.lane.update({ where: { id: laneId }, data: { reopenOnReply } });
  revalidateBoards();
}

// A finished status: moving a card there takes it off the board and into the List. Gmail is left as it is.
export async function setLaneFinished(laneId: string, finished: boolean) {
  await ownLane(laneId);
  await db.lane.update({ where: { id: laneId }, data: { finished } });
  revalidateBoards();
}

// Archive threads in Gmail (take them out of the Inbox). Returns each thread's labels after.
export async function archiveThreads(threadIds: string[]): Promise<{ labelIds?: Record<string, string[]>; error?: string }> {
  const user = await requireUser();
  try {
    return { labelIds: await archiveFor(user, threadIds) };
  } catch (e) {
    console.error("archiveThreads failed", e);
    return { error: mailErrorMessage(e) };
  }
}

async function archiveFor(user: Awaited<ReturnType<typeof requireUser>>, threadIds: string[]) {
  const out: Record<string, string[]> = {};
  for (const t of threadIds.filter((t) => !isLocalThread(t))) {
    const labelIds = await modifyThreadLabels(user, t, [], ["INBOX"]);
    await db.email.updateMany({ where: { userId: user.id, threadId: t }, data: { labelIds } });
    out[t] = labelIds;
  }
  return out;
}

// Deleting a lane sends its emails back to unsorted (their placements go with it).
export async function deleteLane(laneId: string) {
  await ownLane(laneId);
  await db.lane.delete({ where: { id: laneId } });
  revalidateBoards();
}

export async function reorderLanes(workspaceId: string, laneIds: string[]) {
  await ownWorkspace(workspaceId);
  await db.$transaction(
    laneIds.map((id, position) => db.lane.updateMany({ where: { id, workspaceId }, data: { position } })),
  );
  revalidateBoards();
}

// ---------- tickets with no email ----------

// labelId: the label being looked through, so the ticket shows in that view.
// A card with no email, made from one of the board's views: in a status (Lanes),
// with a next action due on a day (Calendar), or filed as information (File).
// labelId: the label being looked through, so the card shows in that view.
export async function createTicket(
  workspaceId: string,
  title: string,
  labelId?: string,
  opts: { laneId?: string; dueDate?: string | null; dueTime?: boolean; filed?: boolean } = {},
): Promise<BoardEmail> {
  const { user } = await ownWorkspace(workspaceId);
  const name = title.trim().slice(0, 200) || "Untitled ticket";
  const now = new Date();
  const lane = opts.laneId ? await db.lane.findFirst({ where: { id: opts.laneId, workspaceId }, select: { id: true } }) : null;
  const last = lane ? await db.placement.aggregate({ where: { laneId: lane.id }, _max: { position: true } }) : null;
  const ticket = await db.email.create({
    data: {
      userId: user.id,
      workspaceId,
      threadId: `${LOCAL_PREFIX}${randomUUID()}`,
      subject: name,
      from: user.name ?? user.email,
      snippet: "",
      date: now,
      labelIds: labelId && isAssignableLabel(labelId) && labelId !== "INBOX" ? [labelId] : [],
      hiddenAt: opts.filed ? now : null,
      ...(opts.dueDate
        ? { tasks: { create: { userId: user.id, title: name, dueDate: new Date(opts.dueDate), dueTime: !!opts.dueTime, position: 0 } } }
        : {}),
      ...(lane ? { placements: { create: { workspaceId, laneId: lane.id, position: (last?._max.position ?? -1) + 1 } } } : {}),
    },
    include: emailInclude,
  });
  await db.activity.create({ data: { userId: user.id, workspaceId, emailId: ticket.id, kind: "ticket" } });
  revalidateBoards();
  revalidateTaskPages();
  return toBoardEmail(ticket);
}

// Title and description of a ticket with no email. Emails' own subjects come from Gmail.
export async function updateTicket(threadId: string, patch: { subject?: string; snippet?: string }) {
  const user = await requireUser();
  if (!isLocalThread(threadId)) throw new Error("Only tickets without an email can be edited");
  await db.email.updateMany({
    where: { userId: user.id, threadId },
    data: {
      ...(patch.subject !== undefined ? { subject: patch.subject.trim().slice(0, 200) || "Untitled ticket" } : {}),
      ...(patch.snippet !== undefined ? { snippet: patch.snippet.slice(0, 5000) } : {}),
    },
  });
  revalidateBoards();
  revalidatePath("/tasks");
}

export async function deleteTicket(threadId: string) {
  const user = await requireUser();
  if (!isLocalThread(threadId)) throw new Error("Only tickets without an email can be deleted");
  await db.email.deleteMany({ where: { userId: user.id, threadId } });
  revalidateBoards();
  revalidatePath("/tasks");
}

// ---------- cards with several threads ----------

const cardOf = async (userId: string, threadId: string) => (await boardEmailsFor(userId, [], [threadId]))[0];

// Add an email thread to a card. Its notes, tasks and links (and any threads it
// already held) move to the card, it leaves its own status, and it gets the
// card's labels in Gmail so the two stay together there too.
export async function addThreadToCard(cardThreadId: string, thread: ThreadSnapshot): Promise<{ card?: BoardEmail; error?: string }> {
  const user = await requireUser();
  if (isLocalThread(thread.threadId)) return { error: "A ticket with no email can't be added to a card." };
  if (thread.threadId === cardThreadId) return { error: "That's this card's own email." };
  const card = await db.email.findUnique({
    where: { userId_threadId: { userId: user.id, threadId: cardThreadId } },
    include: { placements: true },
  });
  if (!card) return { error: "That card no longer exists." };
  if (card.parentId) return { error: "That email is part of another card." };
  try {
    const existing = await db.email.findUnique({ where: { userId_threadId: { userId: user.id, threadId: thread.threadId } } });
    const have = existing?.labelIds ?? thread.labelIds ?? [];
    const add = card.labelIds.filter((id) => id.startsWith("Label_") && !have.includes(id));
    const labelIds = add.length ? await modifyThreadLabels(user, thread.threadId, add, []) : undefined;
    const child = await upsertEmail(user.id, { ...thread, ...(labelIds ? { labelIds } : {}) });
    const childPlacement = await db.placement.findUnique({ where: { emailId: child.id } });
    await db.$transaction([
      db.email.updateMany({ where: { parentId: child.id }, data: { parentId: card.id } }),
      db.email.update({ where: { id: child.id }, data: { parentId: card.id } }),
      db.note.updateMany({ where: { emailId: child.id }, data: { emailId: card.id } }),
      db.task.updateMany({ where: { emailId: child.id }, data: { emailId: card.id } }),
      db.ticketLink.updateMany({ where: { emailId: child.id }, data: { emailId: card.id } }),
      db.activity.updateMany({ where: { emailId: child.id }, data: { emailId: card.id } }),
      // A card has one status: the card's own, or this email's if the card had none.
      ...(childPlacement
        ? [
            card.placements.length
              ? db.placement.delete({ where: { id: childPlacement.id } })
              : db.placement.update({ where: { id: childPlacement.id }, data: { emailId: card.id } }),
          ]
        : []),
      db.activity.create({ data: { userId: user.id, emailId: card.id, kind: "thread", detail: thread.subject.slice(0, 120) } }),
    ]);
    revalidateBoards();
    revalidatePath("/dashboard");
    return { card: await cardOf(user.id, cardThreadId) };
  } catch (e) {
    console.error("addThreadToCard failed", e);
    return { error: mailErrorMessage(e) };
  }
}

// Split a thread off its card: it becomes a card of its own, in the same status
// as the card it came from (just below it), keeping its labels.
export async function removeThreadFromCard(threadId: string): Promise<{ card?: BoardEmail; thread?: BoardEmail; error?: string }> {
  const user = await requireUser();
  const row = await db.email.findUnique({
    where: { userId_threadId: { userId: user.id, threadId } },
    select: { id: true, parent: { select: { threadId: true, placements: { select: { workspaceId: true, laneId: true, position: true } } } } },
  });
  if (!row?.parent) return { error: "That email isn't part of a card." };
  const home = row.parent.placements[0];
  await db.$transaction([
    db.email.update({ where: { id: row.id }, data: { parentId: null } }),
    ...(home
      ? [
          db.placement.updateMany({
            where: { laneId: home.laneId, position: { gt: home.position } },
            data: { position: { increment: 1 } },
          }),
          db.placement.create({ data: { workspaceId: home.workspaceId, laneId: home.laneId, emailId: row.id, position: home.position + 1 } }),
        ]
      : []),
  ]);
  revalidateBoards();
  const [card, thread] = await Promise.all([cardOf(user.id, row.parent.threadId), cardOf(user.id, threadId)]);
  return { card, thread };
}

// A card's own title (empty goes back to the first email's subject) and summary.
export async function updateCard(threadId: string, patch: { title?: string; summary?: string }) {
  const user = await requireUser();
  await db.email.updateMany({
    where: { userId: user.id, threadId },
    data: {
      ...(patch.title !== undefined ? { title: patch.title.trim().slice(0, 200) || null } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary.slice(0, 5000) } : {}),
    },
  });
  revalidateBoards();
}

// ---------- lane templates ----------

// Add a template's lanes after any the workspace already has.
export async function applyLaneTemplate(workspaceId: string, lanes: TemplateLane[]): Promise<LaneDTO[]> {
  await ownWorkspace(workspaceId);
  const clean = parseTemplateLanes(lanes);
  const count = await db.lane.count({ where: { workspaceId } });
  const created = await db.$transaction(
    clean.map((l, i) =>
      db.lane.create({ data: { workspaceId, name: l.name, reopenOnReply: l.reopenOnReply, finished: !!l.finished, position: count + i } }),
    ),
  );
  revalidateBoards();
  return created.map((l) => ({ id: l.id, name: l.name, reopenOnReply: l.reopenOnReply, finished: l.finished, threadIds: [], since: {} }));
}

export async function saveLaneTemplate(name: string, lanes: TemplateLane[]): Promise<LaneTemplateDTO> {
  const user = await requireUser();
  const clean = parseTemplateLanes(lanes);
  const t = await db.laneTemplate.create({
    data: { userId: user.id, name: name.trim().slice(0, 80) || "My lanes", lanes: clean },
  });
  revalidateBoards();
  return { id: t.id, name: t.name, builtIn: false, lanes: clean };
}

export async function deleteLaneTemplate(templateId: string) {
  const user = await requireUser();
  await db.laneTemplate.deleteMany({ where: { id: templateId, userId: user.id } });
  revalidateBoards();
}

// ---------- placing emails ----------

// Save the result of a drag (or a lane picked in the email panel):
// - `lanes`: the full email order of every lane that changed
// - `unsorted`: emails taken out of lanes, back to the unsorted list
// A card has one home, so placing it here moves it out of any other workflow.
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

  // Which emails actually changed column, for the activity log (reorders aren't logged).
  const before = await db.placement.findMany({
    where: { emailId: { in: [...idOf.values()] } },
    select: { emailId: true, laneId: true, workspaceId: true },
  });
  const laneBefore = new Map(before.map((p) => [p.emailId, p.laneId]));
  const laneNames = new Map(
    (await db.lane.findMany({ where: { id: { in: laneIds } }, select: { id: true, name: true } })).map((l) => [l.id, l.name]),
  );
  const moves = [
    ...change.lanes.flatMap((l) =>
      l.threadIds
        .map((t) => idOf.get(t))
        .filter((id): id is string => !!id && laneBefore.get(id) !== l.laneId)
        .map((emailId) => ({ emailId, detail: laneNames.get(l.laneId) ?? "" })),
    ),
    ...change.unsorted
      .map((t) => idOf.get(t))
      .filter((id): id is string => !!id && before.some((p) => p.emailId === id && p.workspaceId === workspaceId))
      .map((emailId) => ({ emailId, detail: "" })),
  ];

  await db.$transaction([
    db.placement.deleteMany({
      where: { workspaceId, emailId: { in: change.unsorted.map((t) => idOf.get(t)).filter((x): x is string => !!x) } },
    }),
    ...change.lanes.flatMap((l) =>
      l.threadIds
        .filter((t) => idOf.has(t))
        .map((t, position) =>
          db.placement.upsert({
            where: { emailId: idOf.get(t)! },
            create: { workspaceId, laneId: l.laneId, emailId: idOf.get(t)!, position },
            update: {
              workspaceId,
              laneId: l.laneId,
              position,
              ...(laneBefore.get(idOf.get(t)!) !== l.laneId ? { movedAt: new Date() } : {}),
            },
          }),
        ),
    ),
    db.activity.createMany({ data: moves.map((m) => ({ userId: user.id, workspaceId, kind: "moved", ...m })) }),
    // A card put in a status counts as seen up to its latest message (if it never
    // was), so the next reply shows as new even if it was never opened here.
    db.$executeRaw`UPDATE "Email" SET "lastSeenAt" = "date" WHERE "lastSeenAt" IS NULL AND "id" = ANY(${[...idOf.values()]})`,
  ]);
  revalidateBoards();
}

// ---------- notes ----------

export async function addNote(thread: ThreadSnapshot, body: string): Promise<NoteDTO> {
  const user = await requireUser();
  const email = await upsertEmail(user.id, thread);
  const note = await db.note.create({ data: { emailId: email.id, body: body.trim() } });
  await db.activity.create({ data: { userId: user.id, emailId: email.id, kind: "note", detail: note.body.slice(0, 120) } });
  return { id: note.id, body: note.body, createdAt: note.createdAt.toISOString() };
}

export async function deleteNote(noteId: string) {
  const user = await requireUser();
  await db.note.deleteMany({ where: { id: noteId, email: { userId: user.id } } });
}

// ---------- links ----------

// Only web links are kept, so a saved link can't run script when opened.
function cleanUrl(raw: string): string | null {
  const text = raw.trim();
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function addLink(thread: ThreadSnapshot, rawUrl: string, title: string): Promise<{ link?: LinkDTO; error?: string }> {
  const user = await requireUser();
  const url = cleanUrl(rawUrl);
  if (!url || url.length > 2000) return { error: "That doesn't look like a web link." };
  const email = await upsertEmail(user.id, thread);
  const link = await db.ticketLink.create({ data: { emailId: email.id, url, title: title.trim().slice(0, 200) } });
  return { link: { id: link.id, url: link.url, title: link.title } };
}

export async function deleteLink(linkId: string) {
  const user = await requireUser();
  await db.ticketLink.deleteMany({ where: { id: linkId, email: { userId: user.id } } });
}

// ---------- tasks ----------

const taskDTO = (t: { id: string; title: string; notes: string; done: boolean; dueDate: Date | null; dueTime: boolean }): TaskDTO => ({
  id: t.id,
  title: t.title,
  notes: t.notes,
  done: t.done,
  dueDate: t.dueDate?.toISOString() ?? null,
  dueTime: t.dueTime,
});

const revalidateTaskPages = () => {
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
};

// Adds to the end of the card's task list, or to the top (making it the next action).
export async function addTask(thread: ThreadSnapshot, title: string, dueDate: string | null, dueTime = false, atTop = false): Promise<TaskDTO> {
  const user = await requireUser();
  const email = await upsertEmail(user.id, thread);
  const ends = await db.task.aggregate({ where: { emailId: email.id }, _min: { position: true }, _max: { position: true } });
  const position = atTop ? (ends._min.position ?? 0) - 1 : (ends._max.position ?? -1) + 1;
  const task = await db.task.create({
    data: { userId: user.id, emailId: email.id, title: title.trim(), dueDate: dueDate ? new Date(dueDate) : null, dueTime: !!dueDate && dueTime, position },
  });
  await db.activity.create({ data: { userId: user.id, emailId: email.id, kind: "task", detail: task.title } });
  revalidateTaskPages();
  return taskDTO(task);
}

// A task on its own, added from My tasks.
export async function addStandaloneTask(title: string, dueDate: string | null, dueTime = false): Promise<TaskDTO> {
  const user = await requireUser();
  const task = await db.task.create({
    data: { userId: user.id, title: title.trim().slice(0, 300) || "Untitled task", dueDate: dueDate ? new Date(dueDate) : null, dueTime: !!dueDate && dueTime },
  });
  await db.activity.create({ data: { userId: user.id, kind: "task", detail: task.title } });
  revalidateTaskPages();
  return taskDTO(task);
}

export async function updateTask(
  taskId: string,
  patch: { done?: boolean; title?: string; notes?: string; dueDate?: string | null; dueTime?: boolean },
) {
  const user = await requireUser();
  await db.task.updateMany({
    where: { id: taskId, userId: user.id },
    data: {
      ...(patch.done !== undefined ? { done: patch.done } : {}),
      ...(patch.title !== undefined ? { title: patch.title.trim().slice(0, 300) || "Untitled task" } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes.slice(0, 5000) } : {}),
      ...(patch.dueDate !== undefined
        ? { dueDate: patch.dueDate ? new Date(patch.dueDate) : null, dueTime: !!patch.dueDate && !!patch.dueTime }
        : {}),
    },
  });
  if (patch.done) {
    const task = await db.task.findFirst({ where: { id: taskId, userId: user.id } });
    if (task) await db.activity.create({ data: { userId: user.id, emailId: task.emailId, kind: "taskDone", detail: task.title } });
  }
  revalidateTaskPages();
}

// A card's tasks in their new order. The first open one is the card's next action.
export async function reorderTasks(taskIds: string[]) {
  const user = await requireUser();
  await db.$transaction(
    taskIds.slice(0, 500).map((id, position) => db.task.updateMany({ where: { id, userId: user.id }, data: { position } })),
  );
  revalidateTaskPages();
}

export async function deleteTask(taskId: string) {
  const user = await requireUser();
  await db.task.deleteMany({ where: { id: taskId, userId: user.id } });
  revalidateTaskPages();
}

// ---------- deleting (Gmail's Trash) ----------

// Move a card's emails to Gmail's Trash and take the card off the board. Its
// notes and next actions are kept, so Undo brings everything back.
export async function trashCard(threadIds: string[]): Promise<{ error?: string }> {
  const user = await requireUser();
  try {
    for (const t of threadIds.filter((t) => !isLocalThread(t))) {
      const labelIds = await trashThread(user, t, true);
      await db.email.updateMany({ where: { userId: user.id, threadId: t }, data: { labelIds } });
    }
    await db.placement.deleteMany({ where: { email: { userId: user.id, threadId: { in: threadIds } } } });
    revalidateBoards();
    return {};
  } catch (e) {
    console.error("trashCard failed", e);
    return { error: mailErrorMessage(e) };
  }
}

export async function untrashCard(threadIds: string[]): Promise<{ error?: string }> {
  const user = await requireUser();
  try {
    for (const t of threadIds.filter((t) => !isLocalThread(t))) {
      const labelIds = await trashThread(user, t, false);
      await db.email.updateMany({ where: { userId: user.id, threadId: t }, data: { labelIds } });
    }
    revalidateBoards();
    return {};
  } catch (e) {
    console.error("untrashCard failed", e);
    return { error: mailErrorMessage(e) };
  }
}

// ---------- marking older labelled mail as done ----------

// Labelled mail from before this date counts as done: it stays out of the
// triage column and Recent (until a new message arrives). "now" for this
// moment, a yyyy-mm-dd date for the start of that day, null to clear it.
export async function setTriageFrom(when: "now" | string | null): Promise<string | null> {
  const user = await requireUser();
  const parsed = when && when !== "now" ? new Date(`${when}T00:00:00`) : null;
  const triageFrom = when === "now" ? new Date() : parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  await db.user.update({ where: { id: user.id }, data: { triageFrom } });
  revalidateBoards();
  revalidatePath("/", "layout");
  return triageFrom?.toISOString() ?? null;
}

// ---------- hiding from the first column ----------

// File an email that doesn't need tracking (it shows again when a newer message
// arrives), or bring it back. Nothing changes in Gmail.
// ---------- ignored senders ----------

const cleanAddress = (a: string) => a.trim().toLowerCase().replace(/[^\w.@+-]/g, "").slice(0, 200);

// Silence senders (newsletters, notifications): their mail stays out of the Inbox
// column from now on. Nothing changes in Gmail. Returns the full list.
export async function ignoreSenders(addresses: string[]): Promise<string[]> {
  const user = await requireUser();
  const add = addresses.map(cleanAddress).filter((a) => a.includes("@"));
  const list = [...new Set([...user.ignoredSenders, ...add])].slice(-500);
  await db.user.update({ where: { id: user.id }, data: { ignoredSenders: list } });
  revalidateBoards();
  return list;
}

export async function unignoreSender(address: string): Promise<string[]> {
  const user = await requireUser();
  const list = user.ignoredSenders.filter((a) => a !== cleanAddress(address));
  await db.user.update({ where: { id: user.id }, data: { ignoredSenders: list } });
  revalidateBoards();
  revalidatePath("/settings");
  return list;
}

// ---------- the List view ----------

// Done: cards in a finished status, newest first, including those that have
// dropped off the board. Filed: emails set aside as information (no status),
// until a newer message brings them back to triage.
export async function fetchFiled(): Promise<{ done: FiledCard[]; filed: FiledCard[]; error?: string }> {
  const user = await requireUser();
  try {
    const [done, filed] = await Promise.all([
      db.placement.findMany({
        where: { workspace: { userId: user.id }, lane: { finished: true } },
        orderBy: { movedAt: "desc" },
        take: 300,
        include: { lane: { select: { id: true, name: true } }, email: { include: emailInclude } },
      }),
      db.email.findMany({
        where: { userId: user.id, hiddenAt: { not: null }, parentId: null, placements: { none: {} } },
        orderBy: { hiddenAt: "desc" },
        take: 300,
        include: emailInclude,
      }),
    ]);
    return {
      done: done.map((p) => ({ card: toBoardEmail(p.email), at: p.movedAt.toISOString(), laneId: p.lane.id, status: p.lane.name })),
      filed: filed
        .map((e) => ({ card: toBoardEmail(e), at: e.hiddenAt!.toISOString() }))
        .filter((f) => f.card.hidden),
    };
  } catch (e) {
    console.error("fetchFiled failed", e);
    return { done: [], filed: [], error: "Couldn't load the List. Try again." };
  }
}

export async function setHidden(thread: ThreadSnapshot, hidden: boolean) {
  const user = await requireUser();
  const email = await upsertEmail(user.id, thread);
  await db.email.update({ where: { id: email.id }, data: { hiddenAt: hidden ? new Date() : null } });
  revalidateBoards();
}

// ---------- pinned labels ----------

// Labels pinned to the top of the sidebar, and the labels on every open card
// (in a status that isn't finished) so the sidebar can count them.
export async function fetchPins(): Promise<{ pinned: string[]; open: string[][] }> {
  const user = await requireUser();
  const cards = await db.placement.findMany({
    where: { workspace: { userId: user.id }, lane: { finished: false } },
    select: { email: { select: { labelIds: true, threads: { select: { labelIds: true } } } } },
  });
  return {
    pinned: user.pinnedLabels,
    open: cards.map((c) => [...new Set([c.email.labelIds, ...c.email.threads.map((t) => t.labelIds)].flat())]),
  };
}

export async function setPinnedLabels(labelIds: string[]) {
  const user = await requireUser();
  const clean = [...new Set(labelIds.filter((id) => typeof id === "string" && id.startsWith("Label_")))].slice(0, 30);
  await db.user.update({ where: { id: user.id }, data: { pinnedLabels: clean } });
}

// ---------- preferences ----------

export async function saveTheme(theme: string) {
  const user = await requireUser();
  if (!isThemeId(theme)) return;
  await db.user.update({ where: { id: user.id }, data: { theme } });
}

// ---------- waiting for a reply ----------

export type Waiting = {
  threadId: string;
  messageId: string;
  subject: string;
  to: string[];
  date: string;
  labelIds: string[]; // the thread's Gmail labels, plus its card's
  cardId: string | null; // the card it's on, to open (a thread added to a card opens that card)
  status: string | null; // its status on the Workspace, if it's in one
  done: boolean; // in a finished status
};

// Sent emails nobody has answered yet, minus the ones marked "No reply needed".
export async function fetchWaiting(): Promise<{ items: Waiting[]; error?: string }> {
  const user = await requireUser();
  try {
    const skip = new Set(user.notWaiting);
    const sent = (await listAwaitingReply(user)).filter((w) => !skip.has(w.messageId));
    // Where each one is on the Workspace: its card's status, done, or not on the board.
    const lane = { select: { lane: { select: { name: true, finished: true } } } } as const;
    const rows = await db.email.findMany({
      where: { userId: user.id, threadId: { in: sent.map((w) => w.threadId) } },
      select: { threadId: true, placements: lane, parent: { select: { threadId: true, labelIds: true, placements: lane } } },
    });
    const byThread = new Map(rows.map((r) => [r.threadId, r]));
    const items = sent.map((w): Waiting => {
      const row = byThread.get(w.threadId);
      const card = row?.parent ?? row;
      const at = card?.placements[0]?.lane;
      const labelIds = [...new Set([...w.labelIds, ...(row?.parent?.labelIds ?? [])])];
      return { ...w, labelIds, cardId: card?.threadId ?? null, status: at?.name ?? null, done: !!at?.finished };
    });
    return { items };
  } catch (e) {
    console.error("fetchWaiting failed", e);
    return { items: [], error: mailErrorMessage(e) };
  }
}

// This sent message needs no answer. A later message in the thread is tracked again.
export async function notWaiting(messageId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!/^[\w-]{1,64}$/.test(messageId)) return { error: "That message can't be found." };
  const list = [...new Set([...user.notWaiting, messageId])].slice(-500);
  await db.user.update({ where: { id: user.id }, data: { notWaiting: list } });
  return {};
}

// Opened lately, wherever they are (a thread added to a card shows as the card),
// with labels so Today can show just the open label's.
export type RecentOpen = { threadId: string; title: string; from: string; at: string; labelIds: string[] };
export async function fetchRecentlyOpened(): Promise<RecentOpen[]> {
  const user = await requireUser();
  const card = { threadId: true, subject: true, title: true, labelIds: true } as const;
  const rows = await db.email.findMany({
    where: { userId: user.id, openedAt: { not: null } },
    orderBy: { openedAt: "desc" },
    take: 60,
    select: { ...card, from: true, openedAt: true, parent: { select: card } },
  });
  const seen = new Set<string>();
  const out: RecentOpen[] = [];
  for (const r of rows) {
    const c = r.parent ?? r;
    if (seen.has(c.threadId)) continue;
    seen.add(c.threadId);
    out.push({ threadId: c.threadId, title: c.title || c.subject, from: r.from, at: r.openedAt!.toISOString(), labelIds: [...new Set([...r.labelIds, ...c.labelIds])] });
  }
  return out;
}
