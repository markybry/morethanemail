"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { BoardEmail, TaskDTO } from "@/lib/types";
import { nextAction } from "@/lib/cards";
import { isOverdue } from "@/lib/format";
import type { Due } from "./DuePicker";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const NO_DATE = "none";
const SHOWN_PER_DAY = 4;

type Item = { email: BoardEmail; task: TaskDTO; status: string | undefined };

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

// Move a due date to another day, keeping its time of day when it has one.
function onDay(task: TaskDTO, day: Date): Due {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0, 0);
  if (task.dueDate && task.dueTime) {
    const old = new Date(task.dueDate);
    d.setHours(old.getHours(), old.getMinutes());
  }
  return { dueDate: d.toISOString(), dueTime: task.dueTime };
}

// The board as a month: each card sits on the day its next action is due.
// Drag a card to another day to move that date.
export function CalendarBoard({
  cardIds,
  emails,
  statusOf,
  onOpen,
  onReschedule,
}: {
  cardIds: string[];
  emails: Record<string, BoardEmail>;
  statusOf: (threadId: string) => string | undefined;
  onOpen: (threadId: string) => void;
  onReschedule: (threadId: string, taskId: string, due: Due) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [dragging, setDragging] = useState<Item | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const { byDay, undated, items } = useMemo(() => {
    const byDay = new Map<string, Item[]>();
    const undated: Item[] = [];
    const items = new Map<string, Item>();
    for (const id of cardIds) {
      const email = emails[id];
      const task = email && nextAction(email.tasks);
      if (!email || !task) continue;
      const item = { email, task, status: statusOf(id) };
      items.set(id, item);
      if (!task.dueDate) undated.push(item);
      else {
        const k = dayKey(new Date(task.dueDate));
        byDay.set(k, [...(byDay.get(k) ?? []), item]);
      }
    }
    for (const list of byDay.values()) list.sort((a, b) => a.task.dueDate!.localeCompare(b.task.dueDate!));
    return { byDay, undated, items };
  }, [cardIds, emails, statusOf]);

  // Six weeks from the Monday on or before the 1st.
  const start = addDays(month, -((month.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weeks = days[35].getMonth() !== month.getMonth() ? days.slice(0, 35) : days;
  const monthDays = weeks.filter((d) => d.getMonth() === month.getMonth());

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    const item = items.get(String(active.id));
    if (!item || !over) return;
    const target = String(over.id);
    if (target === NO_DATE) {
      if (item.task.dueDate) onReschedule(item.email.threadId, item.task.id, { dueDate: null, dueTime: false });
      return;
    }
    const day = days.find((d) => dayKey(d) === target);
    if (day && (!item.task.dueDate || dayKey(new Date(item.task.dueDate)) !== target))
      onReschedule(item.email.threadId, item.task.id, onDay(item.task, day));
  };

  return (
    <DndContext
      id="calendar-board"
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={({ active }) => setDragging(items.get(String(active.id)) ?? null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 md:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold text-walnut">
              {month.toLocaleDateString([], { month: "long", year: "numeric" })}
            </h2>
            <div className="ml-auto flex items-center gap-1">
              <NavButton onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} label="Previous month">
                ‹
              </NavButton>
              <NavButton onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))} label="This month">
                Today
              </NavButton>
              <NavButton onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} label="Next month">
                ›
              </NavButton>
            </div>
          </div>

          {/* Desktop: a month grid. */}
          <div className="paper hidden min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line md:flex">
            <div className="grid grid-cols-7 border-b border-line text-center text-xs font-semibold text-muted">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1.5">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-7" style={{ gridTemplateRows: `repeat(${weeks.length / 7}, minmax(0, 1fr))` }}>
              {weeks.map((d) => (
                <DayCell
                  key={dayKey(d)}
                  day={d}
                  items={byDay.get(dayKey(d)) ?? []}
                  isToday={dayKey(d) === dayKey(today)}
                  outside={d.getMonth() !== month.getMonth()}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </div>

          {/* Phone: the month's dated days as a list. */}
          <div className="space-y-3 md:hidden">
            {monthDays.filter((d) => byDay.has(dayKey(d))).length === 0 && (
              <p className="text-sm text-muted">No next actions due this month.</p>
            )}
            {monthDays
              .filter((d) => byDay.has(dayKey(d)))
              .map((d) => (
                <section key={dayKey(d)}>
                  <h3 className={`mb-1 text-xs font-semibold ${dayKey(d) === dayKey(today) ? "text-accent-ink" : "text-muted"}`}>
                    {d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}
                  </h3>
                  <div className="space-y-1">
                    {byDay.get(dayKey(d))!.map((it) => (
                      <CalendarCard key={it.email.threadId} item={it} onOpen={onOpen} roomy />
                    ))}
                  </div>
                </section>
              ))}
          </div>
        </div>

        <Undated items={undated} onOpen={onOpen} />
      </div>

      <DragOverlay dropAnimation={null}>{dragging ? <CardChip item={dragging} lifted /> : null}</DragOverlay>
    </DndContext>
  );
}

function NavButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} className="btn-press rounded-lg bg-oat px-2.5 py-0.5 text-sm font-semibold text-bark">
      {children}
    </button>
  );
}

function DayCell({ day, items, isToday, outside, onOpen }: { day: Date; items: Item[]; isToday: boolean; outside: boolean; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(day) });
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, SHOWN_PER_DAY);
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-24 min-w-0 flex-col gap-0.5 overflow-y-auto border-r border-b border-line p-1 [scrollbar-width:thin] nth-[7n]:border-r-0 ${
        outside ? "bg-oat/40" : ""
      } ${isOver ? "bg-accent-soft" : ""}`}
    >
      <span
        className={`self-end px-1 text-xs ${
          isToday ? "rounded-full bg-terracotta font-bold text-cream" : outside ? "text-faint" : "text-muted"
        }`}
      >
        {day.getDate()}
      </span>
      {shown.map((it) => (
        <CalendarCard key={it.email.threadId} item={it} onOpen={onOpen} />
      ))}
      {items.length > SHOWN_PER_DAY && (
        <button onClick={() => setAll((v) => !v)} className="px-1 text-left text-[11px] font-semibold text-muted hover:text-bark">
          {all ? "Show fewer" : `+${items.length - SHOWN_PER_DAY} more`}
        </button>
      )}
    </div>
  );
}

function CalendarCard({ item, onOpen, roomy }: { item: Item; onOpen: (id: string) => void; roomy?: boolean }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: item.email.threadId });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(item.email.threadId)}
      className={`block w-full text-left ${isDragging ? "opacity-30" : ""}`}
    >
      <CardChip item={item} roomy={roomy} />
    </button>
  );
}

function CardChip({ item, roomy, lifted }: { item: Item; roomy?: boolean; lifted?: boolean }) {
  const { task, email } = item;
  const late = !!task.dueDate && isOverdue(task.dueDate, task.dueTime);
  const time = task.dueDate && task.dueTime ? new Date(task.dueDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <div
      className={`card-tactile rounded-lg border-l-4 ${late ? "border-l-bad-ink" : "border-l-moss"} ${roomy ? "px-3 py-2" : "px-1.5 py-1"} ${
        lifted ? "w-56 rotate-2 shadow-lg" : "hover:-translate-y-px"
      } transition`}
      title={`${email.title}: ${task.title}`}
    >
      <div className={`flex items-baseline gap-1 ${roomy ? "text-sm" : "text-[11px]"} leading-tight`}>
        {time && <span className={`shrink-0 font-semibold ${late ? "text-bad-ink" : "text-muted"}`}>{time}</span>}
        <span className="min-w-0 flex-1 truncate font-semibold text-ink">{task.title}</span>
      </div>
      <div className={`truncate text-muted ${roomy ? "text-xs" : "text-[10px]"} leading-tight`}>
        {email.title}
        {item.status && ` · ${item.status}`}
      </div>
    </div>
  );
}

// Cards with a next action but no date yet: drag one onto a day to schedule it.
function Undated({ items, onOpen }: { items: Item[]; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: NO_DATE });
  return (
    <aside
      ref={setNodeRef}
      className={`paper flex shrink-0 flex-col rounded-2xl border border-line p-2 md:w-60 ${isOver ? "bg-accent-soft" : ""}`}
    >
      <h3 className="mb-1 px-1 text-sm font-semibold text-terracotta">No date yet</h3>
      <p className="mb-2 px-1 text-xs text-muted">Next actions without a due date. Drag one onto a day.</p>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {items.length === 0 && <p className="px-1 text-xs text-muted">Every next action has a date.</p>}
        {items.map((it) => (
          <CalendarCard key={it.email.threadId} item={it} onOpen={onOpen} roomy />
        ))}
      </div>
    </aside>
  );
}
