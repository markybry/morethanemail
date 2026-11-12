import type { BoardEmail, CardThread } from "./types";

// Every label on any of the card's threads.
export const cardLabelIds = (e: BoardEmail): string[] => [...new Set([e.labelIds, ...e.threads.map((t) => t.labelIds)].flat())];

// The card's newest message, whichever thread it is in.
export const latestThread = (e: BoardEmail): CardThread | Pick<BoardEmail, "from" | "snippet" | "date"> => e.threads[0] ?? e;

// "Sarah Chen <sarah@acme.co>" -> "sarah@acme.co"
export const senderAddress = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
