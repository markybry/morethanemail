"use client";

import { useEffect, useMemo, useState } from "react";
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
import { fetchEmailsBetween } from "@/app/actions";
import type { BoardEmail, TaskDTO } from "@/lib/types";
import { latestThread, nextAction } from "@/lib/cards";
import { isOverdue, senderName } from "@/lib/format";
import { cached, isFresh, remember } from "@/lib/clientCache";
import { DuePicker, type Due } from "./DuePicker";
import { NewCardForm } from "./NewCard";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const NO_DATE = "none";
const SHOWN_PER_DAY = 3; // month cells: tasks, then emails, before "+n more"
const MAIL_FRESH_MS = 5 * 60_000; // a range fetched this recently isn't asked for again
const PAGES: Record<CalView, number> = { day: 1, week: 2, month: 4 }; // 30 threads a page
const VIEW_KEY = "mte.calendarView";
const MAIL_KEY = "mte.calendarMail";

type CalView = "month" | "week" | "day";
type Item = { email: BoardEmail; task: TaskDTO; status: string | undefined };

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// Move a due date to another day, keeping its time of day when it has one.
function onDay(task: TaskDTO, day: Date): Due {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0, 0);
  if (task.dueDate && task.dueTime) {
    const old = new Date(task.dueDate);
    d.setHours(old.getHours(), old.getMinutes());
  }
  return { dueDate: d.toISOString(), dueTime: task.dueTime };
}

// The board as a calendar (month, week or day): each card sits on the day its
// next action is due, and the mail that arrived each day shows beside them.
// Drag a card to another day to move that date.
export function CalendarBoard({
  labelId,
  cardIds,
  emails,
  statusOf,
  mergeEmails,
  onOpen,
  onReschedule,
  onNew,
}: {
  labelId: string; // whose mail to show: a label (with sub-labels) or INBOX for everything received
  cardIds: string[];
  emails: Record<string, BoardEmail>;
  statusOf: (threadId: string) => string | undefined;
  mergeEmails: (list: BoardEmail[]) => void;
  onOpen: (threadId: string) => void;
  onReschedule: (threadId: string, taskId: string, due: Due) => void;
  onNew: (title: string, due: Due) => Promise<void>; // a new card with no email, its next action due then
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [view, setViewState] = useState<CalView>("month");
  const [anchor, setAnchor] = useState(today); // a day inside the period shown
  const [showMail, setShowMailState] = useState(true);
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "month" || v === "week" || v === "day") setViewState(v);
      if (localStorage.getItem(MAIL_KEY) === "0") setShowMailState(false);
    } catch {}
  }, []);
  const setView = (v: CalView) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };
  const setShowMail = (v: boolean) => {
    setShowMailState(v);
    try {
      localStorage.setItem(MAIL_KEY, v ? "1" : "0");
    } catch {}
  };

  const [dragging, setDragging] = useState<Item | null>(null);
  // The "+" on a day (or "+ New") opens a box for a card due then.
  const [newDue, setNewDue] = useState<Due | null>(null);
  const startNew = (day: Date) => setNewDue({ dueDate: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12).toISOString(), dueTime: false });
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  // The days on screen.
  const month = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const days = useMemo(() => {
    if (view === "day") return [anchor];
    if (view === "week") return Array.from({ length: 7 }, (_, i) => addDays(mondayOf(anchor), i));
    const first = mondayOf(month);
    const all = Array.from({ length: 42 }, (_, i) => addDays(first, i));
    return all[35].getMonth() !== month.getMonth() ? all.slice(0, 35) : all;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- month follows anchor
  }, [view, anchor]);
  const rangeStart = days[0];
  const rangeEnd = addDays(days[days.length - 1], 1);

  const step = (n: number) =>
    setAnchor((a) => (view === "day" ? addDays(a, n) : view === "week" ? addDays(a, 7 * n) : new Date(a.getFullYear(), a.getMonth() + n, 1)));
  const title =
    view === "day"
      ? anchor.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : view === "week"
        ? `${rangeStart.toLocaleDateString([], { day: "numeric", month: "short" })} – ${addDays(rangeEnd, -1).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}`
        : month.toLocaleDateString([], { month: "long", year: "numeric" });

  // Cards' next actions, by the day they're due.
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

  // Mail that arrived in the range, fetched for what's on screen (and kept a few minutes).
  const mailKey = `cal:${labelId}:${rangeStart.getTime()}:${rangeEnd.getTime()}`;
  const [mail, setMail] = useState<{ key: string; emails: BoardEmail[]; more: boolean } | null>(null);
  const [mailError, setMailError] = useState("");
  const [mailBusy, setMailBusy] = useState(false);
  useEffect(() => {
    if (!showMail) return;
    let live = true;
    const hit = cached<{ emails: BoardEmail[]; more: boolean }>(mailKey);
    if (hit) setMail({ key: mailKey, ...hit });
    if (hit && isFresh(mailKey, MAIL_FRESH_MS)) return;
    void (async () => {
      setMailBusy(true);
      setMailError("");
      const got: BoardEmail[] = [];
      let token: string | undefined;
      for (let page = 0; page < PAGES[view]; page++) {
        const res = await fetchEmailsBetween(labelId, rangeStart.toISOString(), rangeEnd.toISOString(), token);
        if (!live) return;
        if (res.error) {
          setMailError(res.error);
          break;
        }
        got.push(...res.emails.filter((e) => !got.some((g) => g.threadId === e.threadId)));
        token = res.nextPageToken;
        if (!token) break;
      }
      if (!live) return;
      setMailBusy(false);
      const value = { emails: got, more: !!token };
      remember(mailKey, value, true);
      setMail({ key: mailKey, ...value });
      mergeEmails(got.filter((e) => !e.partOf));
    })();
    return () => {
      live = false;
      setMailBusy(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key covers the range and label
  }, [mailKey, showMail]);

  // Each thread on the day of its latest message, if that's on screen. Threads
  // already shown as a card's due action that day aren't repeated.
  const mailByDay = useMemo(() => {
    const out = new Map<string, BoardEmail[]>();
    if (!showMail || !mail || mail.key !== mailKey) return out;
    for (const e of mail.emails) {
      const d = new Date(e.date);
      if (d < rangeStart || d >= rangeEnd) continue;
      const k = dayKey(d);
      const cardId = e.partOf ?? e.threadId;
      if (byDay.get(k)?.some((it) => it.email.threadId === cardId)) continue;
      out.set(k, [...(out.get(k) ?? []), e]);
    }
    for (const list of out.values()) list.sort((a, b) => b.date.localeCompare(a.date));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- range follows mailKey
  }, [mail, mailKey, showMail, byDay]);
  const mailCount = [...mailByDay.values()].reduce((n, l) => n + l.length, 0);

  const openMail = (e: BoardEmail) => onOpen(e.partOf ?? e.threadId);

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

  const dayProps = (d: Date) => ({
    day: d,
    items: byDay.get(dayKey(d)) ?? [],
    mail: mailByDay.get(dayKey(d)) ?? [],
    isToday: dayKey(d) === dayKey(today),
    onOpen,
    onOpenMail: openMail,
    onAdd: () => startNew(d),
  });

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
          {/* Header: where you are, how you're looking, and getting about. */}
          <div className="paper mb-2 flex flex-wrap items-center gap-2 rounded-2xl border border-line px-3 py-2">
            <div className="min-w-0">
              <h2 key={title} className="animate-fade-in font-display text-xl leading-tight font-semibold text-walnut">
                {title}
              </h2>
              <p className="text-xs text-muted">
                {[...byDay.entries()].filter(([k]) => days.some((d) => dayKey(d) === k)).reduce((n, [, l]) => n + l.length, 0)} due
                {showMail && (
                  <>
                    {" · "}
                    {mailBusy && !mail ? "checking mail…" : `${mailCount}${mail?.more ? "+" : ""} emails arrived`}
                    {mailBusy && mail && " · updating…"}
                  </>
                )}
              </p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <div role="group" aria-label="Calendar view" className="inline-flex rounded-full bg-oat p-0.5">
                {(["month", "week", "day"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    aria-pressed={view === v}
                    className={`rounded-full px-3 py-0.5 text-sm font-semibold capitalize transition ${
                      view === v ? "bg-cream text-walnut shadow-sm" : "text-muted hover:text-bark"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowMail(!showMail)}
                aria-pressed={showMail}
                className={`btn-press rounded-full px-2.5 py-0.5 text-sm font-semibold transition ${
                  showMail ? "bg-info-bg text-info-ink" : "bg-oat text-muted hover:text-bark"
                }`}
                title={showMail ? "Hide the emails that arrived" : "Show the emails that arrived each day"}
              >
                ✉ Emails
              </button>
              <div className="inline-flex items-center gap-0.5">
                <NavButton onClick={() => step(-1)} label={`Previous ${view}`}>
                  <span className="glyph">‹</span>
                </NavButton>
                <NavButton onClick={() => setAnchor(today)} label="Go to today">
                  Today
                </NavButton>
                <NavButton onClick={() => step(1)} label={`Next ${view}`}>
                  <span className="glyph">›</span>
                </NavButton>
              </div>
              <button
                onClick={() => startNew(view === "day" ? anchor : today)}
                className="btn-press rounded-full bg-moss px-3 py-0.5 text-sm font-bold text-cream"
                title="A new card with a next action due on a day"
              >
                + New
              </button>
            </div>
          </div>
          {mailError && <p className="mb-2 text-sm text-bad-ink">{mailError}</p>}

          {newDue && (
            <NewCardForm className="mb-2" placeholder="What needs doing?" onCreate={(t) => onNew(t, newDue)} onClose={() => setNewDue(null)}>
              <div className="flex items-center gap-2 text-xs text-muted">
                Due
                <DuePicker value={newDue} onChange={(d) => setNewDue(d.dueDate ? d : newDue)} variant="field" align="left" />
              </div>
            </NewCardForm>
          )}

          {view === "month" && (
            <>
              {/* Desktop: a month grid. */}
              <div className="paper hidden min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line shadow-sm md:flex">
                <WeekdayHeader />
                <div
                  key={month.getTime()}
                  className="animate-fade-in grid min-h-0 flex-1 grid-cols-7"
                  style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(0, 1fr))` }}
                >
                  {days.map((d) => (
                    <MonthCell key={dayKey(d)} {...dayProps(d)} outside={d.getMonth() !== month.getMonth()} />
                  ))}
                </div>
              </div>
              {/* Phone: the month's busy days as a list. */}
              <DayList
                className="md:hidden"
                days={days.filter((d) => d.getMonth() === month.getMonth())}
                dayProps={dayProps}
                empty="Nothing due and no mail this month."
              />
            </>
          )}

          {view === "week" && (
            <>
              <div key={rangeStart.getTime()} className="animate-fade-in hidden min-h-0 flex-1 grid-cols-7 gap-2 md:grid">
                {days.map((d) => (
                  <WeekColumn key={dayKey(d)} {...dayProps(d)} />
                ))}
              </div>
              <DayList className="md:hidden" days={days} dayProps={dayProps} showEmptyDays empty="" />
            </>
          )}

          {view === "day" && <DayView key={dayKey(anchor)} {...dayProps(anchor)} />}
        </div>

        <Undated items={undated} onOpen={onOpen} />
      </div>

      <DragOverlay dropAnimation={null}>{dragging ? <CardChip item={dragging} lifted /> : null}</DragOverlay>
    </DndContext>
  );
}

type DayProps = {
  day: Date;
  items: Item[];
  mail: BoardEmail[];
  isToday: boolean;
  onOpen: (id: string) => void;
  onOpenMail: (e: BoardEmail) => void;
  onAdd: () => void;
};

function NavButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="btn-press rounded-full bg-oat px-2.5 py-0.5 text-sm font-semibold text-bark hover:text-terracotta"
    >
      {children}
    </button>
  );
}

function WeekdayHeader() {
  return (
    <div className="grid grid-cols-7 border-b border-line bg-oat/50 text-center text-[0.6875rem] font-bold tracking-widest text-muted uppercase">
      {WEEKDAYS.map((w, i) => (
        <div key={w} className={`py-1.5 ${i >= 5 ? "text-faint" : ""}`}>
          {w}
        </div>
      ))}
    </div>
  );
}

// The date in a day's corner: today's is a filled disc.
function DateBadge({ day, isToday, outside, big }: { day: Date; isToday: boolean; outside?: boolean; big?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold ${big ? "h-8 min-w-8 px-1 text-base" : "h-6 min-w-6 px-1 text-xs"} ${
        isToday ? "bg-terracotta text-cream shadow-sm" : outside ? "text-faint" : "text-bark"
      }`}
    >
      {day.getDate()}
    </span>
  );
}

function AddButton({ day, onAdd }: { day: Date; onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="rounded-full px-1.5 text-sm leading-none font-bold text-muted opacity-0 transition group-hover/day:opacity-100 hover:bg-oat hover:text-terracotta focus:opacity-100 max-md:opacity-100"
      aria-label={`New card due ${day.toLocaleDateString([], { dateStyle: "full" })}`}
      title="New card due this day"
    >
      +
    </button>
  );
}

function MonthCell({ day, items, mail, isToday, outside, onOpen, onOpenMail, onAdd }: DayProps & { outside: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(day) });
  const [all, setAll] = useState(false);
  const total = items.length + mail.length;
  const shownItems = all ? items : items.slice(0, SHOWN_PER_DAY);
  const shownMail = all ? mail : mail.slice(0, Math.max(0, SHOWN_PER_DAY - shownItems.length));
  return (
    <div
      ref={setNodeRef}
      className={`group/day flex min-h-24 min-w-0 flex-col gap-0.5 overflow-y-auto border-r border-b border-line p-1 transition-colors [scrollbar-width:thin] nth-[7n]:border-r-0 ${
        outside ? "bg-oat/40" : isWeekend(day) ? "bg-oat/20" : ""
      } ${isToday ? "bg-accent-soft/60 shadow-[inset_0_0_0_2px_var(--color-terracotta)]" : ""} ${isOver ? "bg-accent-soft" : ""}`}
    >
      <div className="flex items-center">
        <AddButton day={day} onAdd={onAdd} />
        {mail.length > 0 && (
          <span className="ml-1 rounded-full bg-info-bg px-1.5 text-[0.625rem] font-bold text-info-ink" title={`${mail.length} emails arrived`}>
            ✉ {mail.length}
          </span>
        )}
        <span className="ml-auto">
          <DateBadge day={day} isToday={isToday} outside={outside} />
        </span>
      </div>
      {shownItems.map((it) => (
        <CalendarCard key={it.email.threadId} item={it} onOpen={onOpen} />
      ))}
      {shownMail.map((e) => (
        <MailChip key={e.threadId} email={e} onOpen={onOpenMail} />
      ))}
      {total > shownItems.length + shownMail.length && (
        <button onClick={() => setAll(true)} className="px-1 text-left text-[0.6875rem] font-semibold text-muted hover:text-terracotta">
          +{total - shownItems.length - shownMail.length} more
        </button>
      )}
      {all && total > SHOWN_PER_DAY && (
        <button onClick={() => setAll(false)} className="px-1 text-left text-[0.6875rem] font-semibold text-muted hover:text-terracotta">
          Show fewer
        </button>
      )}
    </div>
  );
}

// A week: seven tall columns, everything on each day listed.
function WeekColumn({ day, items, mail, isToday, onOpen, onOpenMail, onAdd }: DayProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(day) });
  return (
    <div
      ref={setNodeRef}
      className={`paper group/day flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border transition-colors ${
        isToday ? "border-terracotta shadow-md" : "border-line shadow-sm"
      } ${isWeekend(day) && !isToday ? "bg-oat/30" : ""} ${isOver ? "bg-accent-soft" : ""}`}
    >
      <div className={`flex items-center gap-1 border-b px-2 py-1.5 ${isToday ? "border-terracotta/40 bg-accent-soft" : "border-line bg-oat/40"}`}>
        <span className={`text-[0.6875rem] font-bold tracking-widest uppercase ${isToday ? "text-accent-ink" : "text-muted"}`}>
          {day.toLocaleDateString([], { weekday: "short" })}
        </span>
        <DateBadge day={day} isToday={isToday} />
        <span className="ml-auto">
          <AddButton day={day} onAdd={onAdd} />
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5 [scrollbar-width:thin]">
        {items.map((it) => (
          <CalendarCard key={it.email.threadId} item={it} onOpen={onOpen} />
        ))}
        {items.length > 0 && mail.length > 0 && <div className="my-1 border-t border-dashed border-line" />}
        {mail.map((e) => (
          <MailChip key={e.threadId} email={e} onOpen={onOpenMail} />
        ))}
        {items.length + mail.length === 0 && <p className="px-1 py-2 text-center text-[0.6875rem] text-faint">—</p>}
      </div>
    </div>
  );
}

// One day, roomy: what's due, then the mail that came in, by time.
function DayView({ day, items, mail, isToday, onOpen, onOpenMail, onAdd }: DayProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(day) });
  return (
    <div
      ref={setNodeRef}
      className={`animate-fade-in grid min-h-0 flex-1 gap-3 overflow-y-auto md:grid-cols-2 ${isOver ? "rounded-2xl bg-accent-soft" : ""}`}
    >
      <section className="paper rounded-2xl border border-line p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-terracotta">Due {isToday ? "today" : "this day"}</h3>
          <span className="text-xs text-muted">{items.length}</span>
          <button onClick={onAdd} className="ml-auto text-xs font-semibold text-muted hover:text-terracotta">
            + Add
          </button>
        </div>
        {items.length === 0 && <p className="text-sm text-muted">Nothing due. Drag a card from “No date yet” to plan it here.</p>}
        <div className="space-y-1.5">
          {items.map((it) => (
            <CalendarCard key={it.email.threadId} item={it} onOpen={onOpen} roomy />
          ))}
        </div>
      </section>
      <section className="paper rounded-2xl border border-line p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-info-ink">✉ Arrived</h3>
          <span className="text-xs text-muted">{mail.length}</span>
        </div>
        {mail.length === 0 && <p className="text-sm text-muted">No mail arrived this day (or emails are hidden).</p>}
        {/* A simple timeline: time on the left, the email on the right. */}
        <ol className="relative space-y-1.5 border-l-2 border-info-bg pl-3">
          {mail.map((e) => (
            <li key={e.threadId} className="relative">
              <span className="absolute top-2.5 -left-[1.2rem] h-2 w-2 rounded-full bg-info-ink ring-2 ring-cream" />
              <MailChip email={e} onOpen={onOpenMail} roomy />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

// Phones (and the month there): days as a list, busy days only unless asked.
function DayList({
  days,
  dayProps,
  showEmptyDays,
  empty,
  className = "",
}: {
  days: Date[];
  dayProps: (d: Date) => DayProps;
  showEmptyDays?: boolean;
  empty: string;
  className?: string;
}) {
  const shown = days.map(dayProps).filter((p) => showEmptyDays || p.items.length + p.mail.length > 0);
  return (
    <div className={`space-y-3 ${className}`}>
      {shown.length === 0 && empty && <p className="text-sm text-muted">{empty}</p>}
      {shown.map((p) => (
        <PhoneDay key={dayKey(p.day)} {...p} />
      ))}
    </div>
  );
}

function PhoneDay({ day, items, mail, isToday, onOpen, onOpenMail, onAdd }: DayProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(day) });
  return (
    <section
      ref={setNodeRef}
      className={`paper group/day rounded-2xl border p-2 ${isToday ? "border-terracotta" : "border-line"} ${isOver ? "bg-accent-soft" : ""}`}
    >
      <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold">
        <DateBadge day={day} isToday={isToday} />
        <span className={isToday ? "text-accent-ink" : "text-muted"}>{day.toLocaleDateString([], { weekday: "long", month: "short" })}</span>
        <span className="ml-auto">
          <AddButton day={day} onAdd={onAdd} />
        </span>
      </h3>
      <div className="space-y-1">
        {items.map((it) => (
          <CalendarCard key={it.email.threadId} item={it} onOpen={onOpen} roomy />
        ))}
        {mail.map((e) => (
          <MailChip key={e.threadId} email={e} onOpen={onOpenMail} roomy />
        ))}
        {items.length + mail.length === 0 && <p className="px-1 text-xs text-faint">Nothing.</p>}
      </div>
    </section>
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

// A card's next action: a solid tile with a coloured edge (red when overdue).
function CardChip({ item, roomy, lifted }: { item: Item; roomy?: boolean; lifted?: boolean }) {
  const { task, email } = item;
  const late = !!task.dueDate && isOverdue(task.dueDate, task.dueTime);
  const time = task.dueDate && task.dueTime ? timeOf(task.dueDate) : null;
  return (
    <div
      className={`card-tactile rounded-lg border-l-4 ${late ? "border-l-bad-ink" : "border-l-moss"} ${roomy ? "px-3 py-2" : "px-1.5 py-1"} ${
        lifted ? "w-56 rotate-2 shadow-lg" : "hover:-translate-y-px hover:shadow-md"
      } transition`}
      title={`${email.title}: ${task.title}`}
    >
      <div className={`flex items-baseline gap-1 ${roomy ? "text-sm" : "text-[0.6875rem]"} leading-tight`}>
        <span className={`shrink-0 ${late ? "text-bad-ink" : "text-moss"}`} aria-hidden>
          {late ? "!" : "☐"}
        </span>
        {time && <span className={`shrink-0 font-semibold ${late ? "text-bad-ink" : "text-muted"}`}>{time}</span>}
        <span className="min-w-0 flex-1 truncate font-semibold text-ink">{task.title}</span>
      </div>
      <div className={`truncate text-muted ${roomy ? "text-xs" : "text-[0.625rem]"} leading-tight`}>
        {email.title}
        {item.status && <span className="ml-1 rounded-full bg-info-bg px-1 text-info-ink">{item.status}</span>}
      </div>
    </div>
  );
}

// An email that arrived: lighter than a card, an envelope and the sender.
function MailChip({ email, onOpen, roomy }: { email: BoardEmail; onOpen: (e: BoardEmail) => void; roomy?: boolean }) {
  const latest = latestThread(email);
  return (
    <button
      onClick={() => onOpen(email)}
      className={`block w-full rounded-lg border border-dashed border-line bg-cream/70 text-left transition hover:border-solid hover:border-info-ink/40 hover:bg-cream ${
        roomy ? "px-3 py-2" : "px-1.5 py-0.5"
      } ${email.unread ? "font-semibold" : ""}`}
      title={`${senderName(latest.from)}: ${email.subject}`}
    >
      <div className={`flex items-baseline gap-1 ${roomy ? "text-sm" : "text-[0.6875rem]"} leading-tight`}>
        <span className="shrink-0 text-info-ink" aria-hidden>
          ✉
        </span>
        {roomy && <span className="shrink-0 text-xs text-muted">{timeOf(email.date)}</span>}
        <span className="min-w-0 flex-1 truncate text-ink">{email.subject || "(no subject)"}</span>
        {email.unread && <span className="h-1.5 w-1.5 shrink-0 self-center rounded-full bg-terracotta" title="Unread" />}
      </div>
      <div className={`truncate text-muted ${roomy ? "text-xs" : "text-[0.625rem]"} leading-tight`}>
        {senderName(latest.from)}
        {roomy && latest.snippet && <span className="text-faint"> · {latest.snippet}</span>}
      </div>
    </button>
  );
}

// Cards with a next action but no date yet: drag one onto a day to schedule it.
function Undated({ items, onOpen }: { items: Item[]; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: NO_DATE });
  return (
    <aside
      ref={setNodeRef}
      className={`paper flex shrink-0 flex-col rounded-2xl border border-line p-2 shadow-sm md:w-60 ${isOver ? "bg-accent-soft" : ""}`}
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
