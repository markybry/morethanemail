import type { BoardEmail } from "./types";
import { senderName } from "./format";

// Ways to group the unsorted column. Grouping only changes how cards are shown;
// lanes stay the place where emails are actually sorted.
export const GROUP_BY = ["none", "sender", "date", "label"] as const;
export type GroupBy = (typeof GROUP_BY)[number];
export const GROUP_BY_NAMES: Record<GroupBy, string> = { none: "No grouping", sender: "Sender", date: "Date", label: "Other label" };
export const isGroupBy = (v: unknown): v is GroupBy => GROUP_BY.includes(v as GroupBy);

export type Group = { key: string; title: string; threadIds: string[] };

function dateBucket(iso: string): [number, string] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  const t = new Date(iso).getTime();
  if (t >= start.getTime()) return [0, "Today"];
  if (t >= start.getTime() - day) return [1, "Yesterday"];
  if (t >= start.getTime() - 6 * day) return [2, "This week"];
  if (t >= start.getTime() - 29 * day) return [3, "This month"];
  return [4, "Older"];
}

// Groups in a stable order: date buckets newest first, others biggest first
// then by name. The order of emails within a group is kept.
export function groupThreads(
  threadIds: string[],
  emails: Record<string, BoardEmail>,
  by: GroupBy,
  opts: { labelNames: Map<string, string>; hereLabelId: string },
): Group[] {
  if (by === "none") return [{ key: "all", title: "", threadIds }];
  const groups = new Map<string, Group & { rank: number }>();
  const add = (key: string, title: string, rank: number, id: string) => {
    const g = groups.get(key) ?? { key, title, rank, threadIds: [] };
    g.threadIds.push(id);
    groups.set(key, g);
  };
  const here = opts.labelNames.get(opts.hereLabelId);
  for (const id of threadIds) {
    const e = emails[id];
    if (!e) continue;
    if (by === "sender") {
      const name = e.local ? "Tickets" : senderName(e.from);
      add(name.toLowerCase(), name, 0, id);
    } else if (by === "date") {
      const [rank, title] = dateBucket(e.date);
      add(title, title, rank, id);
    } else {
      // The email's most specific other label, as on its card.
      const names = e.labelIds
        .map((l) => opts.labelNames.get(l))
        .filter((n): n is string => !!n && n !== here && !(here && here.startsWith(`${n}/`)));
      const name = names.filter((n) => !names.some((o) => o.startsWith(`${n}/`))).sort()[0];
      add(name ?? "", name ? name.split("/").join(" › ") : "No other label", name ? 0 : 1, id);
    }
  }
  return [...groups.values()].sort(
    (a, b) => a.rank - b.rank || (by === "date" ? 0 : b.threadIds.length - a.threadIds.length || a.title.localeCompare(b.title)),
  );
}
