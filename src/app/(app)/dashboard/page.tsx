import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { dueLabel, isOverdue, timeAgo } from "@/lib/format";
import { TaskCheckbox } from "@/components/TaskCheckbox";

const boardLink = (labelId: string | undefined, threadId?: string) =>
  `/l/${encodeURIComponent(labelId ?? "INBOX")}${threadId ? `?thread=${encodeURIComponent(threadId)}` : ""}`;

// Everything at a glance: how each workspace's lanes stand, what's due, which
// sorted emails have new replies, and what changed recently.
export default async function DashboardPage() {
  const user = await requireUser();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [workspaces, openTasks, replies, activity] = await Promise.all([
    db.workspace.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      include: {
        lanes: { orderBy: { position: "asc" }, include: { _count: { select: { placements: true } } } },
        _count: { select: { tickets: true } },
      },
    }),
    db.task.findMany({
      where: { done: false, userId: user.id },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      include: {
        email: {
          select: {
            threadId: true,
            subject: true,
            workspace: { select: { labelId: true } },
            placements: { take: 1, select: { workspace: { select: { labelId: true } } } },
          },
        },
      },
    }),
    // Stored dates are as of the last time the app looked at Gmail.
    db.email.findMany({
      where: { userId: user.id, lastSeenAt: { not: null }, date: { gt: db.email.fields.lastSeenAt }, placements: { some: {} } },
      orderBy: { date: "desc" },
      take: 8,
      select: {
        threadId: true,
        subject: true,
        date: true,
        placements: { take: 1, select: { workspace: { select: { labelId: true, name: true } } } },
      },
    }),
    db.activity.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        email: { select: { threadId: true, subject: true, placements: { take: 1, select: { workspace: { select: { labelId: true } } } } } },
        workspace: { select: { labelId: true, name: true } },
      },
    }),
  ]);

  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < startOfToday).length;
  const sorted = workspaces.reduce((n, w) => n + w.lanes.reduce((m, l) => m + l._count.placements, 0), 0);
  const boards = workspaces.filter((w) => w.lanes.length > 0 || w._count.tickets > 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
        <h1 className="text-xl font-semibold text-walnut">Dashboard</h1>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Open tasks" value={openTasks.length} href="/tasks" />
          <Stat label="Overdue" value={overdue} href="/tasks" alert={overdue > 0} />
          <Stat label="New replies in lanes" value={replies.length} alert={replies.length > 0} />
          <Stat label="Sorted into lanes" value={sorted} />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Panel title="Workspaces">
            {boards.length === 0 && <Empty>No lanes yet. Open a label and add some.</Empty>}
            <ul className="space-y-3">
              {boards.map((w) => (
                <li key={w.id}>
                  <Link href={boardLink(w.labelId)} className="font-semibold text-walnut hover:text-terracotta">
                    {w.name.split("/").join(" › ")}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    {w.lanes.map((l) => (
                      <span key={l.id} className="rounded-full border border-line bg-paper px-2 py-0.5 text-bark">
                        {l.name} <b className="text-walnut">{l._count.placements}</b>
                      </span>
                    ))}
                    {w._count.tickets > 0 && (
                      <span className="rounded-full bg-info-bg px-2 py-0.5 text-info-ink">✎ {w._count.tickets} tickets</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Due next">
            {openTasks.length === 0 && <Empty>No open tasks.</Empty>}
            <ul className="divide-y divide-line">
              {openTasks.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-1.5">
                  <TaskCheckbox taskId={t.id} done={t.done} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-walnut">{t.title}</div>
                    {t.email && (
                      <Link
                        href={boardLink(t.email.placements[0]?.workspace.labelId ?? t.email.workspace?.labelId, t.email.threadId)}
                        className="block truncate text-xs text-muted hover:text-terracotta"
                      >
                        {t.email.subject}
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

          <Panel title="New replies on sorted emails">
            {replies.length === 0 && <Empty>Nothing new on the emails in your lanes.</Empty>}
            <ul className="divide-y divide-line">
              {replies.map((e) => (
                <li key={e.threadId} className="py-1.5">
                  <Link
                    href={boardLink(e.placements[0]?.workspace.labelId, e.threadId)}
                    className="block truncate text-sm text-walnut hover:text-terracotta"
                  >
                    {e.subject}
                  </Link>
                  <div className="truncate text-xs text-muted">
                    {e.placements[0]?.workspace.name} · {timeAgo(e.date.toISOString())}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Recent activity">
            {activity.length === 0 && <Empty>Moves, tasks and notes will show up here.</Empty>}
            <ul className="divide-y divide-line">
              {activity.map((a) => (
                <li key={a.id} className="flex gap-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 text-bark">
                    {describe(a.kind, a.detail)}{" "}
                    {a.email && (
                      <Link
                        href={boardLink(a.workspace?.labelId ?? a.email.placements[0]?.workspace.labelId, a.email.threadId)}
                        className="font-semibold text-walnut hover:text-terracotta"
                      >
                        {a.email.subject}
                      </Link>
                    )}
                    {a.workspace && <span className="text-muted"> in {a.workspace.name.split("/").join(" › ")}</span>}
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
      return detail ? `Moved to ${detail}:` : "Back to Unsorted:";
    case "ticket":
      return "New ticket:";
    case "task":
      return `Task “${detail}” added to`;
    case "taskDone":
      return `Done “${detail}” on`;
    case "note":
      return "Note on";
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
