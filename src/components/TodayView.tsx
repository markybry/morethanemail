"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchRecentlyOpened, type RecentOpen, type Waiting } from "@/app/actions";
import type { BoardEmail } from "@/lib/types";
import { nextAction } from "@/lib/cards";
import { isOverdue, senderName, timeAgo } from "@/lib/format";
import { WaitingForReplies } from "./WaitingForReplies";
import { byDue, TaskLine, useOffBoardCards, type OnBoard, type TaskRow } from "./TasksView";

// Summary (the "today" view), seen through the open label (All shows everything): replies you're
// owed, one next action per card, new replies, cards stuck too long, and what
// you opened lately. Each section has its own place so nothing gets lost.
export function TodayView({
  onBoard,
  inLensIds,
  ageOf,
  toggleTask,
  onOpen,
  onAddToBoard,
  onFileWaiting,
  onTrashWaiting,
  firstLaneName,
}: {
  onBoard: OnBoard[]; // cards in a status, already filtered to the label
  inLensIds: (labelIds: string[]) => boolean; // under the open label (always true for All)
  ageOf: (threadId: string) => { text: string; stale: boolean } | null;
  toggleTask: (cardId: string, taskId: string, done: boolean) => void;
  onOpen: (threadId: string) => void;
  onAddToBoard: (threadId: string) => Promise<void>;
  onFileWaiting: (threadId: string) => Promise<void>;
  onTrashWaiting: (threadId: string) => Promise<void>;
  firstLaneName: string;
}) {
  // Cards not in a status (filed tickets from the Tasks tab, first-column
  // emails) count too, when they have something to do.
  const off = useOffBoardCards(onBoard, inLensIds);
  const onBoardIds = useMemo(() => new Set(onBoard.map((x) => x.card.threadId)), [onBoard]);

  // One next action per card, by due date, undated last.
  const actions = useMemo<TaskRow[]>(
    () =>
      [...onBoard, ...off.cards.map((card) => ({ card, status: undefined }))]
        .flatMap(({ card, status }) => {
          const task = nextAction(card.tasks);
          return task ? [{ card, status, task }] : [];
        })
        .sort(byDue),
    [onBoard, off.cards],
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

        <WaitingForReplies
          keep={keepWaiting}
          onOpen={onOpen}
          onAddToBoard={onAddToBoard}
          onFile={onFileWaiting}
          onTrash={onTrashWaiting}
          firstLaneName={firstLaneName}
        />

        <div className="grid gap-5 md:grid-cols-2">
          <Panel title="Next actions" hint="One per card: the first open task. Add tasks in the Tasks tab.">
            {actions.length === 0 && <Empty>No next actions here.</Empty>}
            <ul className="space-y-1.5">
              {actions.map((r, i) => (
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
