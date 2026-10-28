import type { LaneTemplateDTO, TemplateLane } from "./types";

// Ready-made lane sets offered on a workspace with no lanes yet.
// Lanes that mean "finished" or "waiting" reopen on a new reply.
export const BUILT_IN_TEMPLATES: LaneTemplateDTO[] = [
  {
    id: "builtin:kanban",
    name: "To do · Doing · Done",
    builtIn: true,
    lanes: [
      { name: "To do", reopenOnReply: false },
      { name: "Doing", reopenOnReply: false },
      { name: "Done", reopenOnReply: true },
    ],
  },
  {
    id: "builtin:triage",
    name: "Triage",
    builtIn: true,
    lanes: [
      { name: "Action needed", reopenOnReply: false },
      { name: "Waiting on reply", reopenOnReply: true },
      { name: "Done", reopenOnReply: true },
    ],
  },
  {
    id: "builtin:support",
    name: "Support",
    builtIn: true,
    lanes: [
      { name: "New", reopenOnReply: false },
      { name: "In progress", reopenOnReply: false },
      { name: "Waiting on customer", reopenOnReply: true },
      { name: "Resolved", reopenOnReply: true },
    ],
  },
  {
    id: "builtin:sales",
    name: "Sales",
    builtIn: true,
    lanes: [
      { name: "Lead", reopenOnReply: false },
      { name: "Quoted", reopenOnReply: true },
      { name: "Won", reopenOnReply: false },
      { name: "Lost", reopenOnReply: true },
    ],
  },
];

// Stored template lanes come back as JSON; keep only well-formed entries.
export function parseTemplateLanes(value: unknown): TemplateLane[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((l): l is { name: string; reopenOnReply?: unknown } => typeof l?.name === "string" && l.name.trim() !== "")
    .map((l) => ({ name: l.name.trim().slice(0, 80), reopenOnReply: l.reopenOnReply === true }))
    .slice(0, 20);
}
