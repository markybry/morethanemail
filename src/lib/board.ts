import type { Card, CardEmail, Note, Task } from "@prisma/client";
import { db } from "./db";
import type { CardDTO, ProjectDTO } from "./types";

const DEFAULT_LANES = ["To do", "In progress", "Waiting on others", "Done"];
const PROJECT_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6"];

export const cardInclude = {
  emails: { orderBy: { emailDate: "desc" } },
  notes: { orderBy: { createdAt: "desc" } },
  tasks: { orderBy: { position: "asc" } },
} as const;

export function toCardDTO(card: Card & { emails: CardEmail[]; notes: Note[]; tasks: Task[] }): CardDTO {
  return {
    id: card.id,
    laneId: card.laneId,
    title: card.title,
    emails: card.emails.map((e) => ({
      id: e.id,
      threadId: e.threadId,
      subject: e.subject,
      from: e.from,
      snippet: e.snippet,
      emailDate: e.emailDate.toISOString(),
    })),
    notes: card.notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString() })),
    tasks: card.tasks.map((t) => ({ id: t.id, title: t.title, done: t.done, dueDate: t.dueDate?.toISOString() ?? null })),
  };
}

export async function loadProject(userId: string, projectId: string): Promise<ProjectDTO | null> {
  const project = await db.project.findFirst({
    where: { id: projectId, userId },
    include: {
      lanes: {
        orderBy: { position: "asc" },
        include: { cards: { orderBy: { position: "asc" }, include: cardInclude } },
      },
    },
  });
  if (!project) return null;
  const origin = project.originCardId
    ? await db.card.findFirst({ where: { id: project.originCardId, userId }, select: { id: true, title: true } })
    : null;
  return {
    id: project.id,
    name: project.name,
    color: project.color,
    origin: origin ? { cardId: origin.id, title: origin.title } : null,
    lanes: project.lanes.map((l) => ({ id: l.id, name: l.name, cards: l.cards.map(toCardDTO) })),
  };
}

export async function listProjects(userId: string) {
  return db.project.findMany({
    where: { userId },
    orderBy: { position: "asc" },
    select: { id: true, name: true, color: true },
  });
}

export async function newProject(userId: string, name: string, originCardId?: string) {
  const count = await db.project.count({ where: { userId } });
  return db.project.create({
    data: {
      userId,
      name: name.trim() || "Untitled workspace",
      color: PROJECT_COLORS[count % PROJECT_COLORS.length],
      position: count,
      originCardId,
      lanes: { create: DEFAULT_LANES.map((n, i) => ({ name: n, position: i })) },
    },
    include: { lanes: { orderBy: { position: "asc" } } },
  });
}
