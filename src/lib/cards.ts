import type { BoardEmail, CardThread, TaskDTO } from "./types";

// Every label on any of the card's threads.
export const cardLabelIds = (e: BoardEmail): string[] => [...new Set([e.labelIds, ...e.threads.map((t) => t.labelIds)].flat())];

// Has one of the user's own labels (not just Inbox, Sent…): only those are filed.
export const hasOwnLabel = (e: BoardEmail) => cardLabelIds(e).some((id) => id.startsWith("Label_"));

// The card's newest message, whichever thread it is in.
export const latestThread = (e: BoardEmail): CardThread | Pick<BoardEmail, "from" | "snippet" | "date"> => e.threads[0] ?? e;

// "Sarah Chen <sarah@acme.co>" -> "sarah@acme.co"
export const senderAddress = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();

// A card's next action: the first open task in the card's own order.
export const nextAction = (tasks: TaskDTO[]) => tasks.find((t) => !t.done);
