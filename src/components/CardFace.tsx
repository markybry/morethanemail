"use client";

import type { BoardEmail } from "@/lib/types";
import { dueLabel, isOverdue, senderName, shortDate } from "@/lib/format";
import { useMail } from "./MailContext";

// An email on the board. The same card is used in the unsorted column and in
// lanes, because the email is the ticket.
export function CardFace({ email, hideLabelId, dragging }: { email: BoardEmail; hideLabelId?: string; dragging?: boolean }) {
  const { labelNames, colorOf } = useMail();
  const accent = (hideLabelId && colorOf(hideLabelId)) || "var(--color-terracotta)";
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
      className={`card-tactile group/card animate-rise relative cursor-grab overflow-hidden rounded-2xl p-3 pl-4 transition duration-200 hover:-translate-y-0.5 active:translate-y-px ${
        email.newReply ? "ring-2 ring-mustard/70" : ""
      } ${dragging ? "w-68 rotate-2 cursor-grabbing" : ""}`}
    >
      <span className="absolute inset-y-2 left-1.5 w-1 rounded-full transition-all group-hover/card:w-1.5" style={{ background: accent }} />
      <div className="flex items-baseline gap-2 text-xs">
        <span className={`min-w-0 flex-1 truncate ${email.unread ? "font-bold text-walnut" : "text-bark"}`}>
          {senderName(email.from)}
        </span>
        <span className="shrink-0 text-muted">{shortDate(email.date)}</span>
      </div>
      <div className={`mt-0.5 text-sm leading-snug ${email.unread ? "font-extrabold text-walnut" : "font-semibold text-ink"}`}>
        {email.subject}
      </div>
      <div className="mt-0.5 truncate text-xs text-muted">{email.snippet}</div>
      {(email.newReply || chips.length > 0 || email.tasks.length > 0 || email.notes.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {email.newReply && (
            <Badge tone="blue">
              <span className="relative mr-1 inline-flex h-1.5 w-1.5 align-middle">
                <span className="animate-ping-soft absolute inline-flex h-full w-full rounded-full bg-terracotta" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-terracotta" />
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
    green: "bg-ok-bg text-ok-ink",
    red: "bg-bad-bg text-bad-ink",
    amber: "bg-warn-bg text-warn-ink",
    blue: "bg-accent-soft font-bold text-accent-ink",
    label: "border border-line bg-paper text-bark",
  }[tone ?? "label"];
  return <span className={`rounded-full px-2 py-0.5 font-semibold ${tone ? cls : "bg-info-bg text-info-ink"}`}>{children}</span>;
}
