"use client";

import { createContext, useContext } from "react";
import type { BoardEmail, TaskDTO } from "@/lib/types";
import { dueLabel, isOverdue, senderName, shortDate } from "@/lib/format";
import { useMail } from "./MailContext";
import { cardLabelIds, latestThread } from "@/lib/cards";

// What the board offers its cards: ticking off next actions without opening
// the card, and how long the card has sat in its status.
export type CardAge = { text: string; stale: boolean };
export const CardBoardContext = createContext<{
  toggleTask: (cardId: string, taskId: string, done: boolean) => void;
  ageOf: (threadId: string) => CardAge | null;
  // On a phone, cards are filed with a menu rather than by dragging.
  statuses: { id: string; name: string }[];
  statusOf: (threadId: string) => string | null;
  moveTo: (threadId: string, statusId: string | null) => void;
  canArchive: (threadId: string) => boolean;
  archive: (threadId: string) => void;
} | null>(null);

const NEXT_SHOWN = 4;

// Open actions, soonest due first, then in the order they were added.
const nextActions = (tasks: TaskDTO[]) =>
  tasks
    .filter((t) => !t.done)
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.dueDate ?? "9999").localeCompare(b.t.dueDate ?? "9999") || a.i - b.i)
    .map((x) => x.t);

// A card on the board, in the first column or in a status. At a glance: what it
// is (title, and its summary or newest message) and what needs to happen next.
export function CardFace({ email, hideLabelId, dragging }: { email: BoardEmail; hideLabelId?: string; dragging?: boolean }) {
  const { labelNames, colorOf } = useMail();
  const board = useContext(CardBoardContext);
  const toggleTask = board?.toggleTask;
  const age = board?.ageOf(email.threadId) ?? null;
  const accent = (hideLabelId && colorOf(hideLabelId)) || "var(--color-terracotta)";
  const next = nextActions(email.tasks);
  const done = email.tasks.length - next.length;
  const summary = email.summary.trim();

  // Other labels on the email, most specific only ("Clients/Acme" implies "Clients").
  // The workspace's own label and its parents go without saying.
  const here = hideLabelId ? labelNames.get(hideLabelId) : undefined;
  const latest = latestThread(email);
  const named = cardLabelIds(email)
    .map((id) => ({ id, name: labelNames.get(id) }))
    .filter((l): l is { id: string; name: string } => !!l.name && l.name !== here && !(here && here.startsWith(`${l.name}/`)));
  const chips = named
    .filter((l) => !named.some((o) => o.name.startsWith(`${l.name}/`)))
    .map((l) => ({ key: l.id, text: l.name.split("/").join(" › "), color: colorOf(l.id) }));

  return (
    <div
      className={`card-tactile group/card animate-rise relative cursor-grab overflow-hidden rounded-2xl p-3 pl-4 transition duration-200 hover:-translate-y-0.5 active:translate-y-px ${
        email.newReply ? "ring-2 ring-mustard/70" : age?.stale ? "ring-2 ring-bad-ink/40" : ""
      } ${dragging ? "w-68 rotate-2 cursor-grabbing" : ""}`}
    >
      <span className="absolute inset-y-2 left-1.5 w-1 rounded-full transition-all group-hover/card:w-1.5" style={{ background: accent }} />
      <div className="flex items-baseline gap-2 text-xs">
        <span className={`min-w-0 flex-1 truncate ${email.unread ? "font-bold text-walnut" : "text-bark"}`}>
          {email.local && email.threads.length <= 1 ? "✎ Ticket" : senderName(latest.from)}
        </span>
        <span className="shrink-0 text-muted">{shortDate(latest.date)}</span>
      </div>
      <div className={`mt-0.5 text-sm leading-snug ${email.unread ? "font-extrabold text-walnut" : "font-semibold text-ink"}`}>
        {email.title}
      </div>
      {summary ? (
        <div className="mt-0.5 line-clamp-2 text-xs text-bark">{summary}</div>
      ) : (
        <div className="mt-0.5 truncate text-xs text-muted">{latest.snippet}</div>
      )}
      {next.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-dashed border-line pt-1.5">
          {next.slice(0, NEXT_SHOWN).map((t) => (
            <li key={t.id} className="flex items-start gap-1.5 text-xs leading-snug">
              {toggleTask ? (
                <input
                  type="checkbox"
                  checked={false}
                  aria-label={`Done: ${t.title}`}
                  // Tick it here without picking the card up or opening it.
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleTask(email.threadId, t.id, true)}
                  className="mt-px h-3.5 w-3.5 shrink-0 cursor-pointer accent-moss"
                />
              ) : (
                <span className="text-muted">○</span>
              )}
              <span className="min-w-0 flex-1 text-ink">{t.title}</span>
              {t.dueDate && (
                <span className={`shrink-0 font-semibold ${isOverdue(t.dueDate) ? "text-bad-ink" : "text-muted"}`}>{dueLabel(t.dueDate)}</span>
              )}
            </li>
          ))}
          {next.length > NEXT_SHOWN && <li className="pl-5 text-xs text-muted">+{next.length - NEXT_SHOWN} more</li>}
        </ul>
      )}
      {board && !dragging && (
        // Phone only: file or archive without press-and-drag.
        <div className="mt-2 flex gap-1.5 md:hidden" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <select
            value={board.statusOf(email.threadId) ?? ""}
            onChange={(e) => board.moveTo(email.threadId, e.target.value || null)}
            className="field min-w-0 flex-1 rounded-lg px-2 py-1 text-xs text-bark"
            aria-label="Move to status"
          >
            <option value="">{board.statusOf(email.threadId) ? "Not in a status" : "Move to…"}</option>
            {board.statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {board.canArchive(email.threadId) && (
            <button onClick={() => board.archive(email.threadId)} className="btn-press rounded-lg bg-oat px-2.5 text-xs font-semibold text-bark">
              Archive
            </button>
          )}
        </div>
      )}
      {(email.newReply || !!age || chips.length > 0 || email.threads.length > 1 || email.tasks.length > 0 || email.notes.length > 0 || email.links.length > 0) && (
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
          {age && <Badge tone={age.stale ? "red" : undefined}>⏳ {age.text}</Badge>}
          {email.threads.length > 1 && <Badge>✉ {email.threads.length}</Badge>}
          {email.tasks.length > 0 && (
            <Badge tone={done === email.tasks.length ? "green" : undefined}>
              {done === email.tasks.length ? "✓ All done" : `☑ ${done}/${email.tasks.length}`}
            </Badge>
          )}
          {email.notes.length > 0 && <Badge>✎ {email.notes.length}</Badge>}
          {email.links.length > 0 && <Badge>🔗 {email.links.length}</Badge>}
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
