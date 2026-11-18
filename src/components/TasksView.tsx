"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchOffBoardTaskCards, updateTask } from "@/app/actions";
import type { BoardEmail, TaskDTO } from "@/lib/types";
import { cardLabelIds } from "@/lib/cards";
import { isOverdue } from "@/lib/format";
import { DuePicker, DueText, type Due } from "./DuePicker";

const NO_DUE: Due = { dueDate: null, dueTime: false };

export type OnBoard = { card: BoardEmail; status: string };
export type TaskRow = { task: TaskDTO; card: BoardEmail; status?: string };

// Cards with open tasks that aren't in a status (tasks added here sit on a
// filed ticket; emails waiting in the first column), seen through the open label.
// The board's own cards are left to the board, which keeps them live.
export function useOffBoardCards(onBoard: OnBoard[], inLensIds: (labelIds: string[]) => boolean) {
  const [all, setAll] = useState<BoardEmail[]>([]);
  useEffect(() => {
    void fetchOffBoardTaskCards().then(setAll);
  }, []);
  const cards = useMemo(() => {
    const placed = new Set(onBoard.map((x) => x.card.threadId));
    return all.filter((c) => !placed.has(c.threadId) && inLensIds(cardLabelIds(c)));
  }, [all, onBoard, inLensIds]);
  const add = useCallback((card: BoardEmail) => setAll((prev) => [card, ...prev]), []);
  const finish = useCallback((cardId: string, taskId: string) => {
    const done = (v: boolean) =>
      setAll((prev) => prev.map((c) => (c.threadId === cardId ? { ...c, tasks: c.tasks.map((t) => (t.id === taskId ? { ...t, done: v } : t)) } : c)));
    done(true);
    void updateTask(taskId, { done: true }).catch(() => done(false));
  }, []);
  return { cards, add, finish };
}

export const byDue = (a: TaskRow, b: TaskRow) => (a.task.dueDate ?? "9999").localeCompare(b.task.dueDate ?? "9999");

// The Tasks tab: every open task on the cards under the open label, in a status
// or not, grouped by when it's due. A task added here gets a filed ticket of its
// own under the open label, which can be opened for notes or given a status.
export function TasksView({
  onBoard,
  inLensIds,
  labelName,
  onCreate,
  toggleTask,
  onOpen,
}: {
  onBoard: OnBoard[];
  inLensIds: (labelIds: string[]) => boolean;
  labelName: string | null; // the open label (null on All)
  onCreate: (title: string, due: Due) => Promise<BoardEmail>;
  toggleTask: (cardId: string, taskId: string, done: boolean) => void;
  onOpen: (threadId: string) => void;
}) {
  const off = useOffBoardCards(onBoard, inLensIds);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<Due>(NO_DUE);
  const [adding, setAdding] = useState(false);

  const rows = useMemo<TaskRow[]>(
    () =>
      [
        ...onBoard.flatMap(({ card, status }) => card.tasks.filter((t) => !t.done).map((task) => ({ task, card, status }))),
        ...off.cards.flatMap((card) => card.tasks.filter((t) => !t.done).map((task) => ({ task, card }))),
      ].sort(byDue),
    [onBoard, off.cards],
  );
  const onBoardIds = useMemo(() => new Set(onBoard.map((x) => x.card.threadId)), [onBoard]);

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const isToday = (r: TaskRow) => !!r.task.dueDate && new Date(r.task.dueDate) <= endOfToday;
  const overdue = (r: TaskRow) => !!r.task.dueDate && isOverdue(r.task.dueDate, r.task.dueTime);
  const groups = [
    { title: "Overdue", items: rows.filter(overdue), alert: true },
    { title: "Today", items: rows.filter((r) => isToday(r) && !overdue(r)) },
    { title: "Upcoming", items: rows.filter((r) => !!r.task.dueDate && !isToday(r)) },
    { title: "No due date", items: rows.filter((r) => !r.task.dueDate) },
  ].filter((g) => g.items.length);

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 pb-6">
        <form
          className="paper animate-rise flex gap-2 rounded-3xl border border-line p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim() || adding) return;
            setAdding(true);
            try {
              off.add(await onCreate(title, due));
              setTitle("");
              setDue(NO_DUE);
            } finally {
              setAdding(false);
            }
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={labelName ? `Add a task under ${labelName}` : "Add a task"}
            aria-label="New task"
            className="field min-w-0 flex-1 rounded-xl px-2.5 py-1.5 text-sm"
          />
          <DuePicker value={due} onChange={setDue} variant="field" />
          <button disabled={adding} className="btn-press rounded-xl bg-terracotta px-3 text-sm font-bold text-cream disabled:opacity-60">
            Add
          </button>
        </form>

        {groups.length === 0 && <p className="text-sm text-muted">No open tasks here. Add one above, or open a card and add them there.</p>}
        {groups.map((g) => (
          <section key={g.title}>
            <h2 className={`mb-2 text-xs font-semibold tracking-wide uppercase ${g.alert ? "text-terracotta" : "text-muted"}`}>
              {g.title} · {g.items.length}
            </h2>
            <ul className="space-y-1.5">
              {g.items.map((r, i) => (
                <TaskLine
                  key={r.task.id}
                  row={r}
                  i={i}
                  onDone={() =>
                    onBoardIds.has(r.card.threadId) ? toggleTask(r.card.threadId, r.task.id, true) : off.finish(r.card.threadId, r.task.id)
                  }
                  onOpen={onOpen}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

// A task with its card underneath (unless the card is just that task).
export function TaskLine({ row, i, onDone, onOpen }: { row: TaskRow; i: number; onDone: () => void; onOpen: (threadId: string) => void }) {
  const { task, card, status } = row;
  const where = [card.title !== task.title ? card.title : "", status ?? (card.hidden ? "Filed" : "")].filter(Boolean).join(" · ");
  return (
    <li className="list-row animate-rise flex items-center gap-3 px-3 py-2" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
      <input type="checkbox" checked={false} onChange={onDone} className="h-4 w-4 shrink-0 accent-moss" aria-label={`Done: ${task.title}`} />
      <button onClick={() => onOpen(card.threadId)} className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm text-walnut">{task.title}</div>
        {where && <div className="truncate text-xs text-muted">{where}</div>}
      </button>
      <DueText dueDate={task.dueDate} dueTime={task.dueTime} className="shrink-0 text-xs" />
    </li>
  );
}
