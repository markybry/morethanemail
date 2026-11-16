"use client";

import { useEffect, useRef, useState } from "react";
import { dueLabel, isOverdue } from "@/lib/format";

export type Due = { dueDate: string | null; dueTime: boolean };

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const TIMES = ["09:00", "12:00", "15:00", "17:00"];

const pad = (n: number) => String(n).padStart(2, "0");
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// A day with no time is kept at midday, so it reads as the same day in any time zone nearby.
function toDue(day: Date, time: string): Due {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0, 0);
  if (time) {
    const [h, m] = time.split(":").map(Number);
    d.setHours(h, m);
  }
  return { dueDate: d.toISOString(), dueTime: !!time };
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// The common picks: today, tomorrow, the end of the working week (Friday; next
// Friday at the weekend) and next week (Monday).
export function quickDays() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay(); // 0 Sunday … 6 Saturday
  const friday = addDays(today, dow === 6 ? 6 : 5 - dow);
  const monday = addDays(today, ((8 - dow) % 7) || 7);
  return [
    { label: "Today", day: today },
    { label: "Tomorrow", day: addDays(today, 1) },
    { label: "End of week", day: friday },
    { label: "Next week", day: monday },
  ];
}

// One-tap due dates under an "add a task" box. Tapping the chosen one again clears it.
export function DueChips({ value, onChange }: { value: Due; onChange: (due: Due) => void }) {
  const picked = value.dueDate ? new Date(value.dueDate) : null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {quickDays()
        .slice(0, 3)
        .map((q) => {
          const on = !!picked && sameDay(picked, q.day);
          return (
            <button
              key={q.label}
              type="button"
              onClick={() => onChange(on ? { dueDate: null, dueTime: false } : toDue(q.day, picked && value.dueTime ? hhmm(picked) : ""))}
              aria-pressed={on}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition ${
                on ? "border-moss bg-moss text-cream" : "border-line text-bark hover:bg-oat"
              }`}
            >
              {q.label}
            </button>
          );
        })}
    </div>
  );
}

// Due date button that opens a small calendar with quick picks and an optional time.
export function DuePicker({
  value,
  onChange,
  variant = "chip",
  align = "right",
  done = false,
  className = "",
}: {
  value: Due;
  onChange: (due: Due) => void;
  variant?: "chip" | "field"; // chip: quiet text in a task row; field: a box in an add form
  align?: "left" | "right";
  done?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("touchstart", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("touchstart", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const late = !!value.dueDate && !done && isOverdue(value.dueDate, value.dueTime);
  const text = value.dueDate ? dueLabel(value.dueDate, value.dueTime) : variant === "field" ? "📅 Due" : "Set due";

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={value.dueDate ? "Change due date" : "Set due date"}
        className={
          variant === "field"
            ? `field h-full rounded-xl px-2.5 py-1.5 text-sm whitespace-nowrap ${value.dueDate ? (late ? "text-red-600" : "text-bark") : "text-muted"}`
            : `rounded px-1 text-xs whitespace-nowrap hover:bg-oat ${late ? "font-semibold text-red-600" : "text-muted"}`
        }
      >
        {text}
      </button>
      {open && (
        <Calendar
          value={value}
          align={align}
          onPick={(due, close) => {
            onChange(due);
            if (close) setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Calendar({ value, align, onPick }: { value: Due; align: "left" | "right"; onPick: (due: Due, close: boolean) => void }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selected = value.dueDate ? new Date(value.dueDate) : null;
  const [month, setMonth] = useState(() => {
    const d = selected ?? today;
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const time = selected && value.dueTime ? hhmm(selected) : "";

  // Six weeks starting on the Monday on or before the 1st.
  const start = addDays(month, -((month.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));

  const pickDay = (d: Date) => onPick(toDue(d, time), !time);
  const pickTime = (t: string) => onPick(toDue(selected ?? today, t), false);
  const quick = quickDays();

  return (
    <div
      role="dialog"
      aria-label="Due date"
      className={`absolute z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-cream p-3 text-sm text-ink shadow-lg ${
        align === "right" ? "right-0" : "left-0"
      }`}
    >
      <div className="mb-2 grid grid-cols-2 gap-1">
        {quick.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => pickDay(q.day)}
            className={`rounded-lg px-2 py-1 text-left hover:bg-oat ${selected && sameDay(selected, q.day) ? "font-semibold text-accent-ink" : "text-bark"}`}
          >
            {q.label}
            <span className="ml-1 text-xs text-muted">{q.day.toLocaleDateString([], { weekday: "short" })}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center border-t border-line pt-2">
        <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded px-2 py-0.5 text-muted hover:bg-oat" aria-label="Previous month">
          ‹
        </button>
        <span className="flex-1 text-center font-semibold text-walnut">{month.toLocaleDateString([], { month: "long", year: "numeric" })}</span>
        <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded px-2 py-0.5 text-muted hover:bg-oat" aria-label="Next month">
          ›
        </button>
      </div>
      <div className="mt-1 grid grid-cols-7 text-center text-xs text-muted">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {days.map((d) => {
          const isSel = selected && sameDay(d, selected);
          const isToday = sameDay(d, today);
          const outside = d.getMonth() !== month.getMonth();
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => pickDay(d)}
              className={`h-8 rounded-lg ${
                isSel ? "bg-moss font-bold text-cream" : `hover:bg-oat ${isToday ? "font-bold text-accent-ink" : outside ? "text-faint" : "text-bark"}`
              }`}
              aria-label={d.toLocaleDateString([], { dateStyle: "full" })}
              aria-pressed={!!isSel}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-2 border-t border-line pt-2">
        <div className="flex items-center gap-2">
          <span className="text-muted">Time</span>
          <input
            type="time"
            value={time}
            onChange={(e) => pickTime(e.target.value)}
            className="field rounded-lg px-2 py-0.5 text-bark"
            aria-label="Time"
          />
          {time && (
            <button type="button" onClick={() => pickTime("")} className="text-xs text-muted hover:text-bark">
              No time
            </button>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {TIMES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => pickTime(t)}
              className={`rounded-md border px-2 py-0.5 text-xs ${t === time ? "border-moss bg-moss text-cream" : "border-line text-bark hover:bg-oat"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center border-t border-line pt-2">
        {value.dueDate && (
          <button type="button" onClick={() => onPick({ dueDate: null, dueTime: false }, true)} className="text-xs text-muted hover:text-red-600">
            Clear date
          </button>
        )}
        <button
          type="button"
          onClick={() => onPick(value, true)}
          className="btn-press ml-auto rounded-lg bg-moss px-3 py-1 text-xs font-bold text-cream"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// A due date as text, worked out in the viewer's own time zone.
export function DueText({ dueDate, dueTime, done = false, className = "" }: Due & { done?: boolean; className?: string }) {
  if (!dueDate) return null;
  return (
    <span className={`${className} ${!done && isOverdue(dueDate, dueTime) ? "text-red-600" : "text-muted"}`} suppressHydrationWarning>
      {dueLabel(dueDate, dueTime)}
    </span>
  );
}
