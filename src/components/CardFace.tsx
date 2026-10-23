"use client";

import type { BoardEmail } from "@/lib/types";
import { dueLabel, isOverdue, senderName, shortDate } from "@/lib/format";
import { useMail } from "./MailContext";

// An email on the board. The same card is used in the unsorted column and in
// lanes, because the email is the ticket.
export function CardFace({ email, hideLabelId, dragging }: { email: BoardEmail; hideLabelId?: string; dragging?: boolean }) {
  const { labelNames } = useMail();
  const open = email.tasks.filter((t) => !t.done);
  const nextDue = open
    .map((t) => t.dueDate)
    .filter((d): d is string => !!d)
    .sort()[0];
  const done = email.tasks.length - open.length;

  // Other labels on the email, most specific only ("Clients/Acme" implies "Clients").
  // The workspace's own label and its parents go without saying.
  const here = hideLabelId ? labelNames.get(hideLabelId) : undefined;
  const names = email.labelIds
    .map((id) => labelNames.get(id))
    .filter((n): n is string => !!n && n !== here && !(here && here.startsWith(`${n}/`)));
  const chips = names.filter((n) => !names.some((o) => o.startsWith(`${n}/`))).map((n) => n.split("/").join(" › "));

  return (
    <div
      className={`cursor-grab rounded-lg border bg-white p-2.5 shadow-sm hover:border-slate-300 ${
        email.newReply ? "border-indigo-300" : "border-slate-200"
      } ${dragging ? "w-68 rotate-2 cursor-grabbing shadow-xl" : ""}`}
    >
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
          {email.newReply && <Badge tone="blue">↩ New reply</Badge>}
          {email.tasks.length > 0 && (
            <Badge tone={done === email.tasks.length ? "green" : undefined}>
              ☑ {done}/{email.tasks.length}
            </Badge>
          )}
          {nextDue && <Badge tone={isOverdue(nextDue) ? "red" : "amber"}>⏰ {dueLabel(nextDue)}</Badge>}
          {email.notes.length > 0 && <Badge>✎ {email.notes.length}</Badge>}
          {chips.slice(0, 3).map((c) => (
            <Badge key={c} tone="label">
              {c}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "green" | "red" | "amber" | "blue" | "label" }) {
  const cls = {
    green: "bg-emerald-100 text-emerald-800",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-indigo-100 font-medium text-indigo-700",
    label: "border border-slate-200 text-slate-500",
  }[tone ?? "label"];
  return <span className={`rounded px-1.5 py-0.5 ${tone ? cls : "bg-slate-100 text-slate-600"}`}>{children}</span>;
}
