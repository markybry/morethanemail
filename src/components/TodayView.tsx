"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addStandaloneTask,
  fetchRecentlyOpened,
  fetchStandaloneTasks,
  updateTask,
  type RecentOpen,
  type Waiting,
} from "@/app/actions";
import type { BoardEmail, TaskDTO } from "@/lib/types";
import { nextAction } from "@/lib/cards";
import { isOverdue, senderName, timeAgo } from "@/lib/format";
import { DuePicker, DueText, type Due } from "./DuePicker";

const NO_DUE: Due = { dueDate: null, dueTime: false };
// Next actions: one per card, plus tasks on their own (no card).
type ActionRow = { task: TaskDTO; card?: BoardEmail; status?: string };
import { WaitingForReplies } from "./WaitingForReplies";

type OnBoard = { card: BoardEmail; status: string };

// Summary (the "today" view), seen through the open label (All shows everything): replies you're
// owed, one next action per card, new replies, cards stuck too long, and what
// you opened lately. Each section has its own place so nothing gets lost.
export function TodayView({
  onBoard,
  inLensIds,
  ageOf,
  toggleTask,
  onOpen,
}: {
  onBoard: OnBoard[]; // cards in a status, already filtered to the label
  inLensIds: (labelIds: string[]) => boolean; // under the open label (always true for All)
  ageOf: (threadId: string) => { text: string; stale: boolean } | null;
  toggleTask: (cardId: string, taskId: string, done: boolean) => void;
  onOpen: (threadId: string) => void;
}) {
  // Tasks on their own have no label, so they show whichever label is open.
  const [own, setOwn] = useState<TaskDTO[]>([]);
  useEffect(() => {
    void fetchStandaloneTasks().then(setOwn);
  }, []);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<Due>(NO_DUE);
  const addOwn = async () => {
    if (!title.trim()) return;
    const task = await addStandaloneTask(title, due.dueDate, due.dueTime);
    setOwn((prev) => [...prev, task]);
    setTitle("");
    setDue(NO_DUE);
  };
  const finishOwn = (id: string) => {
    const before = own;
    setOwn((prev) => prev.filter((t) => t.id !== id));
    void updateTask(id, { done: true }).catch(() => setOwn(before));
  };

  // One next action per card, and each task on its own: by due date, undated last.
  const actions = useMemo<ActionRow[]>(
    () =>
      [
        ...onBoard.flatMap(({ card, status }) => {
          const task = nextAction(card.tasks);
          return task ? [{ card, status, task }] : [];
        }),
        ...own.map((task) => ({ task })),
      ].sort((a, b) => (a.task.dueDate ?? "9999").localeCompare(b.task.dueDate ?? "9999")),
    [onBoard, own],
  );
  const overdue = actions.filter((a) => a.task.dueDate && isOverdue(a.task.dueDate, a.task.dueTime)).length;
  const replies = onBoard.filter((x) => x.card.newReply);
  const stuck = onBoard.filter((x) => ageOf(x.card.threadId)?.stale);

  const [recent, setRecent] = useState<RecentOpen[] | null>(null);
  useEffect(() => {
    void fetchRecentlyOpened().then(setRecent);
  }, []);
  const recentShown = (recent ?? []).filter((r) => inLensIds(r.labelIds)).slice(0, 8);

  const keepWaiting = (w: Waiting) => inLensIds(w.labelIds);

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-5 pb-6">
        <div className="grid grid-cols-3 gap-3">
          <Stat i={0} label="Next actions" value={actions.length} />
          <Stat i={1} label="Overdue" value={overdue} alert={overdue > 0} />
          <Stat i={2} label="New replies" value={replies.length} alert={replies.length > 0} />
        </div>

        <WaitingForReplies keep={keepWaiting} onOpen={onOpen} />

        <div className="grid gap-5 md:grid-cols-2">
          <Panel title="Next actions" hint="One per card (its first open task), and any on their own">
            <form
              className="mb-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void addOwn();
              }}
            >
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Add a next action (no email needed)"
                aria-label="New next action"
                className="field min-w-0 flex-1 rounded-xl px-2.5 py-1.5 text-sm"
              />
              <DuePicker value={due} onChange={setDue} variant="field" />
              <button className="btn-press rounded-xl bg-terracotta px-3 text-sm font-bold text-cream">Add</button>
            </form>
            {actions.length === 0 && <Empty>No next actions here.</Empty>}
            <ul className="space-y-1.5">
              {actions.map(({ card, status, task }, i) => (
                <li
                  key={task.id}
                  className="list-row animate-rise flex items-center gap-3 px-3 py-2"
                  style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                >
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => (card ? toggleTask(card.threadId, task.id, true) : finishOwn(task.id))}
                    className="h-4 w-4 shrink-0 accent-moss"
                    aria-label={`Done: ${task.title}`}
                  />
                  <button
                    onClick={() => card && onOpen(card.threadId)}
                    disabled={!card}
                    className="min-w-0 flex-1 text-left disabled:cursor-default"
                  >
                    <div className="truncate text-sm text-walnut">{task.title}</div>
                    <div className="truncate text-xs text-muted">{card ? `${card.title} · ${status}` : "On its own"}</div>
                  </button>
                  <DueText dueDate={task.dueDate} dueTime={task.dueTime} className="shrink-0 text-xs" />
                </li>
              ))}
            </ul>
          </Panel>

          <div className="space-y-5">
            <Panel title="New replies">
              {replies.length === 0 && <Empty>No new replies on these cards.</Empty>}
              <CardRows rows={replies.map(({ card, status }) => ({ card, right: status }))} onOpen={onOpen} />
            </Panel>
            <Panel title="Stuck" hint="In a status that waits on others for a week or more">
              {stuck.length === 0 && <Empty>Nothing stuck.</Empty>}
              <CardRows rows={stuck.map(({ card }) => ({ card, right: ageOf(card.threadId)?.text ?? "" }))} onOpen={onOpen} />
            </Panel>
            <Panel title="Recently opened">
              {!recent && <Empty>…</Empty>}
              {recent && recentShown.length === 0 && <Empty>Emails you open show up here, on the board or not.</Empty>}
              <ul className="space-y-1.5">
                {recentShown.map((r) => (
                  <li key={r.threadId} className="list-row">
                    <button onClick={() => onOpen(r.threadId)} className="flex w-full gap-2 px-3 py-2 text-left">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-walnut">{r.title}</div>
                        <div className="truncate text-xs text-muted">{senderName(r.from)}</div>
                      </div>
                      <span className="shrink-0 text-xs text-muted">{timeAgo(r.at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardRows({ rows, onOpen }: { rows: { card: BoardEmail; right: string }[]; onOpen: (threadId: string) => void }) {
  return (
    <ul className="space-y-1.5">
      {rows.map(({ card, right }) => (
        <li key={card.threadId} className="list-row">
          <button onClick={() => onOpen(card.threadId)} className="flex w-full gap-2 px-3 py-2 text-left">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-walnut">{card.title}</div>
              <div className="truncate text-xs text-muted">{senderName((card.threads[0] ?? card).from)}</div>
            </div>
            <span className="shrink-0 text-xs text-muted">{right}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Stat({ i, label, value, alert }: { i: number; label: string; value: number; alert?: boolean }) {
  return (
    <div className="list-row animate-pop px-4 py-3" style={{ animationDelay: `${i * 60}ms` }}>
      <div className={`text-2xl font-bold ${alert ? "text-terracotta" : "text-walnut"}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="paper animate-rise rounded-3xl border border-line p-4">
      <h2 className="text-sm font-semibold text-terracotta">{title}</h2>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}
