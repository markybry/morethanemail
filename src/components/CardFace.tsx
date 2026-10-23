import type { CardDTO } from "@/lib/types";
import { dueLabel, isOverdue, senderName, shortDate } from "@/lib/format";

// The visual card on a lane. Shared by the board and the drag overlay.
export function CardFace({ card, newReply, dragging }: { card: CardDTO; newReply?: boolean; dragging?: boolean }) {
  const latest = card.emails[0];
  const open = card.tasks.filter((t) => !t.done);
  const nextDue = open
    .map((t) => t.dueDate)
    .filter((d): d is string => !!d)
    .sort()[0];
  const done = card.tasks.length - open.length;

  return (
    <div
      className={`cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm hover:border-slate-300 ${
        dragging ? "w-68 rotate-2 cursor-grabbing shadow-xl" : ""
      }`}
    >
      <div className="text-sm leading-snug font-medium text-slate-900">{card.title}</div>
      {latest && (
        <div className="mt-1 flex gap-2 text-xs text-slate-500">
          <span className="min-w-0 flex-1 truncate">{senderName(latest.from)}</span>
          <span className="shrink-0">{shortDate(latest.emailDate)}</span>
        </div>
      )}
      {(newReply || card.emails.length > 1 || card.tasks.length > 0 || card.notes.length > 0 || nextDue) && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {newReply && <Badge tone="blue">↩ New reply</Badge>}
          {card.emails.length > 1 && <Badge>✉ {card.emails.length}</Badge>}
          {card.tasks.length > 0 && (
            <Badge tone={done === card.tasks.length ? "green" : undefined}>
              ☑ {done}/{card.tasks.length}
            </Badge>
          )}
          {card.notes.length > 0 && <Badge>✎ {card.notes.length}</Badge>}
          {nextDue && <Badge tone={isOverdue(nextDue) ? "red" : "amber"}>⏰ {dueLabel(nextDue)}</Badge>}
        </div>
      )}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "green" | "red" | "amber" | "blue" }) {
  const cls =
    tone === "green"
      ? "bg-emerald-100 text-emerald-800"
      : tone === "red"
        ? "bg-red-100 text-red-700"
        : tone === "amber"
          ? "bg-amber-100 text-amber-800"
          : tone === "blue"
            ? "bg-indigo-100 font-medium text-indigo-700"
            : "bg-slate-100 text-slate-600";
  return <span className={`rounded px-1.5 py-0.5 ${cls}`}>{children}</span>;
}
