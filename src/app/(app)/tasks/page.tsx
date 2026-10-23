import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { dueLabel, isOverdue } from "@/lib/format";
import { TaskCheckbox } from "@/components/TaskCheckbox";

// Every task on every email, grouped by when it is due.
export default async function TasksPage() {
  const user = await requireUser();
  const tasks = await db.task.findMany({
    where: { email: { userId: user.id } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    include: {
      email: {
        select: {
          threadId: true,
          subject: true,
          placements: { take: 1, select: { lane: { select: { name: true } }, workspace: { select: { labelId: true, name: true } } } },
        },
      },
    },
  });

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const open = tasks.filter((t) => !t.done);
  const groups = [
    { title: "Overdue", items: open.filter((t) => t.dueDate && t.dueDate < startOfToday()) },
    { title: "Today", items: open.filter((t) => t.dueDate && t.dueDate >= startOfToday() && t.dueDate <= endOfToday) },
    { title: "Upcoming", items: open.filter((t) => t.dueDate && t.dueDate > endOfToday) },
    { title: "No due date", items: open.filter((t) => !t.dueDate) },
    { title: "Done", items: tasks.filter((t) => t.done).slice(-20) },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">My tasks</h1>
        <p className="mt-1 text-sm text-slate-500">{open.length} open across all your emails.</p>
        {tasks.length === 0 && (
          <p className="mt-8 text-slate-500">No tasks yet. Open an email and add tasks to it.</p>
        )}
        {groups
          .filter((g) => g.items.length)
          .map((g) => (
            <section key={g.title} className="mt-6">
              <h2 className={`mb-2 text-xs font-semibold tracking-wide uppercase ${g.title === "Overdue" ? "text-red-600" : "text-slate-500"}`}>
                {g.title} · {g.items.length}
              </h2>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                {g.items.map((t) => {
                  // Open the email in the workspace where it's sorted, or the inbox.
                  const where = t.email.placements[0];
                  return (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                    <TaskCheckbox taskId={t.id} done={t.done} />
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm ${t.done ? "text-slate-400 line-through" : "text-slate-800"}`}>{t.title}</div>
                      <Link
                        href={`/l/${encodeURIComponent(where?.workspace.labelId ?? "INBOX")}?thread=${t.email.threadId}`}
                        className="block truncate text-xs text-slate-500 hover:text-indigo-600"
                      >
                        {where ? `${where.workspace.name} › ${where.lane.name} › ` : ""}
                        {t.email.subject}
                      </Link>
                    </div>
                    {t.dueDate && (
                      <span className={`shrink-0 text-xs ${!t.done && isOverdue(t.dueDate.toISOString()) ? "text-red-600" : "text-slate-500"}`}>
                        {dueLabel(t.dueDate.toISOString())}
                      </span>
                    )}
                  </li>
                  );
                })}
              </ul>
            </section>
          ))}
      </div>
    </div>
  );
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
