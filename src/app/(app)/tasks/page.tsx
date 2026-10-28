import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { QuickAddTask, TaskRow, type TaskRowData } from "@/components/TaskList";

// Every task, on emails and on its own, grouped by when it is due.
export default async function TasksPage() {
  const user = await requireUser();
  const tasks = await db.task.findMany({
    where: { userId: user.id },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    include: {
      email: {
        select: {
          threadId: true,
          subject: true,
          workspace: { select: { labelId: true } }, // tickets with no email
          placements: { take: 1, select: { lane: { select: { name: true } }, workspace: { select: { labelId: true, name: true } } } },
        },
      },
    },
  });

  // Open the email in the workspace where it's sorted, or the inbox.
  const row = (t: (typeof tasks)[number]): TaskRowData => {
    const where = t.email?.placements[0];
    return {
      id: t.id,
      title: t.title,
      notes: t.notes,
      done: t.done,
      dueDate: t.dueDate?.toISOString() ?? null,
      from: t.email && {
        href: `/l/${encodeURIComponent(where?.workspace.labelId ?? t.email.workspace?.labelId ?? "INBOX")}?thread=${encodeURIComponent(t.email.threadId)}`,
        text: `${where ? `${where.workspace.name} › ${where.lane.name} › ` : ""}${t.email.subject}`,
      },
    };
  };

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
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <h1 className="text-xl font-semibold">My tasks</h1>
        <p className="mt-1 text-sm text-muted">{open.length} open, on emails, tickets and on their own.</p>
        <QuickAddTask />
        {tasks.length === 0 && <p className="mt-8 text-muted">No tasks yet. Add one above, or open an email and add tasks to it.</p>}
        {groups
          .filter((g) => g.items.length)
          .map((g) => (
            <section key={g.title} className="mt-6">
              <h2 className={`mb-2 text-xs font-semibold tracking-wide uppercase ${g.title === "Overdue" ? "text-red-600" : "text-muted"}`}>
                {g.title} · {g.items.length}
              </h2>
              <ul className="divide-y divide-line rounded-lg border border-line bg-cream">
                {g.items.map((t) => (
                  // Keyed on what the server knows so a moved or edited task re-reads its data.
                  <TaskRow key={`${t.id}:${t.done}:${t.dueDate?.getTime() ?? ""}`} task={row(t)} />
                ))}
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
