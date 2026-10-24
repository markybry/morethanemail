"use client";

import type { BoardEmail } from "@/lib/types";
import { dueLabel, isOverdue, senderName, shortDate } from "@/lib/format";
import { useMail } from "./MailContext";

// An email on the board. The same card is used in the unsorted column and in
// lanes, because the email is the ticket.
export function CardFace({ email, hideLabelId, dragging }: { email: BoardEmail; hideLabelId?: string; dragging?: boolean }) {
  const { labelNames, colorOf } = useMail();
  const accent = (hideLabelId && colorOf(hideLabelId)) || "#a78bfa";
  const open = email.tasks.filter((t) => !t.done);
  const nextDue = open
    .map((t) => t.dueDate)
    .filter((d): d is string => !!d)
    .sort()[0];
  const done = email.tasks.length - open.length;

  // Other labels on the email, most specific only ("Clients/Acme" implies "Clients").
  // The workspace's own label and its parents go without saying.
  const here = hideLabelId ? labelNames.get(hideLabelId) : undefined;
  const named = email.labelIds
    .map((id) => ({ id, name: labelNames.get(id) }))
    .filter((l): l is { id: string; name: string } => !!l.name && l.name !== here && !(here && here.startsWith(`${l.name}/`)));
  const chips = named
    .filter((l) => !named.some((o) => o.name.startsWith(`${l.name}/`)))
    .map((l) => ({ key: l.id, text: l.name.split("/").join(" › "), color: colorOf(l.id) }));

  return (
    <div
      className={`group/card animate-rise relative cursor-grab overflow-hidden rounded-xl border bg-white p-2.5 pl-3.5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-200/60 ${
        email.newReply ? "border-fuchsia-300" : "border-white"
      } ${dragging ? "w-68 rotate-3 scale-105 cursor-grabbing shadow-2xl shadow-violet-300/60" : ""}`}
    >
      <span className="absolute inset-y-0 left-0 w-1.5 transition-all group-hover/card:w-2" style={{ background: accent }} />
      <div className="flex items-baseline gap-2 text-xs">
        <span className={`min-w-0 flex-1 truncate ${email.unread ? "font-semibold text-slate-900" : "text-slate-600"}`}>
          {senderName(email.from)}
        </span>
        <span className="shrink-0 text-slate-400">{shortDate(email.date)}</span>
      </div>
      <div className={`mt-0.5 text-sm leading-snug ${email.unread ? "font-semibold text-slate-900" : "font-medium text-slate-800"}`}>
        {email.subject}
      </div>
      <div className="mt-0.5 truncate text-xs text-slate-400">{email.snippet}</div>
      {(email.newReply || chips.length > 0 || email.tasks.length > 0 || email.notes.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {email.newReply && (
            <Badge tone="blue">
              <span className="relative mr-1 inline-flex h-1.5 w-1.5 align-middle">
                <span className="animate-ping-soft absolute inline-flex h-full w-full rounded-full bg-fuchsia-500" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-fuchsia-500" />
              </span>
              New reply
            </Badge>
          )}
          {email.tasks.length > 0 && (
            <Badge tone={done === email.tasks.length ? "green" : undefined}>
              ☑ {done}/{email.tasks.length}
            </Badge>
          )}
          {nextDue && <Badge tone={isOverdue(nextDue) ? "red" : "amber"}>⏰ {dueLabel(nextDue)}</Badge>}
          {email.notes.length > 0 && <Badge>✎ {email.notes.length}</Badge>}
          {chips.slice(0, 3).map((c) => (
            <Badge key={c.key} tone="label">
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: c.color }} />
              {c.text}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "green" | "red" | "amber" | "blue" | "label" }) {
  const cls = {
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-rose-100 text-rose-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-fuchsia-100 font-medium text-fuchsia-700",
    label: "border border-violet-100 bg-violet-50/60 text-violet-700",
  }[tone ?? "label"];
  return <span className={`rounded-full px-2 py-0.5 ${tone ? cls : "bg-sky-100 text-sky-700"}`}>{children}</span>;
}
