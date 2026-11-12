import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { dueLabel, isOverdue, timeAgo } from "@/lib/format";
import { TaskCheckbox } from "@/components/TaskCheckbox";

const STALE_DAYS = 7;
const cardLink = (threadId: string) => `/l/INBOX?thread=${encodeURIComponent(threadId)}`;

// Today: what to do next, what has new replies, what has waited too long, and
// what changed recently. Every card lives in the one workflow, so links open it there.
export default async function TodayPage() {
  const user = await requireUser();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const staleBefore = new Date(Date.now() - STALE_DAYS * 86_400_000);
  const card = { threadId: true, subject: true, title: true } as const;

  const [openTasks, replies, stale, activity] = await Promise.all([
    db.task.findMany({
      where: { done: false, userId: user.id },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      include: { email: { select: card } },
    }),
    // Stored dates are as of the last time the app looked at Gmail.
    db.email.findMany({
      // On a card in a status, or on a thread added to one.
      where: {
        userId: user.id,
        lastSeenAt: { not: null },
        date: { gt: db.email.fields.lastSeenAt },
        OR: [{ placements: { some: {} } }, { parent: { placements: { some: {} } } }],
      },
      orderBy: { date: "desc" },
      take: 8,
      select: { ...card, date: true, parent: { select: card } },
    }),
    // Waiting (a status that reopens on reply) for a week or more.
    db.placement.findMany({
      where: { workspace: { userId: user.id }, movedAt: { lt: staleBefore }, lane: { reopenOnReply: true, finished: false } },
      orderBy: { movedAt: "asc" },
      take: 10,
      select: { movedAt: true, lane: { select: { name: true } }, email: { select: card } },
    }),
    db.activity.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { email: { select: card } },
    }),
  ]);

  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < startOfToday).length;
  const titleOf = (e: { title: string | null; subject: string }) => e.title || e.subject;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
        <h1 className="text-xl font-semibold text-walnut">Today</h1>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Next actions" value={openTasks.length} href="/tasks" />
          <Stat label="Overdue" value={overdue} href="/tasks" alert={overdue > 0} />
          <Stat label="New replies" value={replies.length} alert={replies.length > 0} />
          <Stat label={`Waiting ${STALE_DAYS}+ days`} value={stale.length} alert={stale.length > 0} />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Panel title="Next actions">
            {openTasks.length === 0 && <Empty>No next actions. Add them on a card.</Empty>}
            <ul className="divide-y divide-line">
              {openTasks.slice(0, 10).map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-1.5">
                  <TaskCheckbox taskId={t.id} done={t.done} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-walnut">{t.title}</div>
                    {t.email && (
                      <Link href={cardLink(t.email.threadId)} className="block truncate text-xs text-muted hover:text-terracotta">
                        {titleOf(t.email)}
                      </Link>
                    )}
                  </div>
                  {t.dueDate && (
                    <span className={`shrink-0 text-xs ${isOverdue(t.dueDate.toISOString()) ? "text-red-600" : "text-muted"}`}>
                      {dueLabel(t.dueDate.toISOString())}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="New replies">
            {replies.length === 0 && <Empty>Nothing new on the cards in your statuses.</Empty>}
            <ul className="divide-y divide-line">
              {replies.map((e) => {
                const c = e.parent ?? e;
                return (
                  <li key={e.threadId} className="py-1.5">
                    <Link href={cardLink(c.threadId)} className="block truncate text-sm text-walnut hover:text-terracotta">
                      {titleOf(c)}
                    </Link>
                    <div className="truncate text-xs text-muted">
                      {e.parent ? `${e.subject} · ` : ""}
                      {timeAgo(e.date.toISOString())}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title={`Waiting ${STALE_DAYS} days or more`}>
            {stale.length === 0 && <Empty>Nothing has been waiting too long.</Empty>}
            <ul className="divide-y divide-line">
              {stale.map((p) => (
                <li key={p.email.threadId} className="flex gap-2 py-1.5">
                  <Link href={cardLink(p.email.threadId)} className="min-w-0 flex-1 truncate text-sm text-walnut hover:text-terracotta">
                    {titleOf(p.email)}
                  </Link>
                  <span className="shrink-0 text-xs text-bad-ink">
                    {Math.floor((Date.now() - p.movedAt.getTime()) / 86_400_000)} days in {p.lane.name}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Recent activity">
            {activity.length === 0 && <Empty>Moves, actions and notes will show up here.</Empty>}
            <ul className="divide-y divide-line">
              {activity.map((a) => (
                <li key={a.id} className="flex gap-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 text-bark">
                    {describe(a.kind, a.detail)}{" "}
                    {a.email && (
                      <Link href={cardLink(a.email.threadId)} className="font-semibold text-walnut hover:text-terracotta">
                        {titleOf(a.email)}
                      </Link>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{timeAgo(a.createdAt.toISOString())}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function describe(kind: string, detail: string) {
  switch (kind) {
    case "moved":
      return detail ? `Moved to ${detail}:` : "Back to the first column:";
    case "ticket":
      return "New ticket:";
    case "task":
      return `Next action “${detail}” added to`;
    case "taskDone":
      return `Done “${detail}” on`;
    case "note":
      return "Note on";
    case "thread":
      return `Email “${detail}” added to`;
    default:
      return "";
  }
}

function Stat({ label, value, href, alert }: { label: string; value: number; href?: string; alert?: boolean }) {
  const body = (
    <div className="card-tactile rounded-2xl px-4 py-3">
      <div className={`font-display text-3xl font-semibold ${alert ? "text-terracotta" : "text-walnut"}`}>{value}</div>
      <div className="text-xs font-semibold text-muted">{label}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition hover:-translate-y-0.5">
      {body}
    </Link>
  ) : (
    body
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="paper rounded-3xl border border-line p-4">
      <h2 className="mb-2 text-sm font-semibold text-terracotta">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}
