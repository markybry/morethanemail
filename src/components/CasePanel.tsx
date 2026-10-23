"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addNote,
  addTask,
  attachEmail,
  deleteNote,
  deleteTask,
  detachEmail,
  fetchPickers,
  moveCaseTo,
  promoteToProject,
  removeCard,
  renameCase,
  splitEmail,
  updateTask,
} from "@/app/actions";
import type { ThreadSummary } from "@/lib/mail";
import type { CardDTO, LaneDTO, LaneOption, ProjectDTO, TaskDTO } from "@/lib/types";
import { dueLabel, fromDateInput, gmailLink, isOverdue, senderName, shortDate, toDateInput } from "@/lib/format";
import { Drawer, DrawerHeader } from "./Drawer";
import { ThreadView } from "./ThreadView";
import { ConfirmButton, InlineEdit, Section } from "./ui";

type Props = {
  card: CardDTO;
  project: ProjectDTO;
  lanes: LaneDTO[];
  inbox: ThreadSummary[];
  onEmailSeen: (threadId: string) => void;
  onClose: () => void;
  onChange: (card: CardDTO) => void;
  onRemoved: (cardId: string) => void;
  onMovedAway: (cardId: string, goTo?: { projectId: string }) => void;
  onSplit: (from: CardDTO, created: CardDTO) => void;
};

export function CasePanel({ card, project, lanes, inbox, onEmailSeen, onClose, onChange, onRemoved, onMovedAway, onSplit }: Props) {
  const router = useRouter();
  const isRootCase = project.origin?.cardId === card.id;
  const [busy, setBusy] = useState("");

  async function promote() {
    setBusy("Creating project…");
    const projectId = await promoteToProject(card.id);
    router.push(`/p/${projectId}?case=${card.id}`);
  }

  return (
    <Drawer onClose={onClose}>
      <DrawerHeader onClose={onClose}>
        <p className="mb-1 text-xs font-medium tracking-wide text-slate-400 uppercase">Case</p>
        <InlineEdit
          value={card.title}
          onSave={async (title) => {
            onChange({ ...card, title });
            await renameCase(card.id, title);
          }}
          className="text-lg font-semibold text-slate-900"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <select
            value={card.laneId}
            onChange={async (e) => onChange(await moveCaseTo(card.id, e.target.value))}
            className="rounded-md border border-slate-300 bg-white px-2 py-1"
          >
            {lanes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <MoveElsewhere card={card} project={project} onMoved={(projectId) => onMovedAway(card.id, { projectId })} />
          {isRootCase ? (
            <span className="rounded-md bg-indigo-50 px-2 py-1 text-xs text-indigo-700">This project grew from this case</span>
          ) : (
            <button
              onClick={promote}
              disabled={!!busy}
              className="rounded-md bg-indigo-600 px-2.5 py-1 text-white hover:bg-indigo-700 disabled:opacity-50"
              title="Give this case its own project board. The case moves there with all its emails, notes and tasks."
            >
              {busy || "⇪ Promote to project"}
            </button>
          )}
          <div className="ml-auto">
            <ConfirmButton
              label="Delete case"
              confirmLabel="Delete case, notes and tasks?"
              onConfirm={async () => {
                await removeCard(card.id);
                onRemoved(card.id);
              }}
            />
          </div>
        </div>
      </DrawerHeader>

      <Tasks card={card} onChange={onChange} />
      <Notes card={card} onChange={onChange} />
      <Emails card={card} inbox={inbox} onChange={onChange} onSplit={onSplit} onEmailSeen={onEmailSeen} />
    </Drawer>
  );
}

// ---------- move to another project ----------

function MoveElsewhere({ card, project, onMoved }: { card: CardDTO; project: ProjectDTO; onMoved: (projectId: string) => void }) {
  const [options, setOptions] = useState<LaneOption[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open && !options) void fetchPickers().then((p) => setOptions(p.lanes.filter((l) => l.projectId !== project.id)));
  }, [open, options, project.id]);

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="rounded-md border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50">
        Move to project…
      </button>
    );
  return (
    <select
      autoFocus
      defaultValue=""
      onBlur={() => setOpen(false)}
      onChange={async (e) => {
        const lane = options?.find((l) => l.id === e.target.value);
        if (!lane) return;
        await moveCaseTo(card.id, lane.id);
        onMoved(lane.projectId);
      }}
      className="rounded-md border border-indigo-400 bg-white px-2 py-1"
    >
      <option value="" disabled>
        {options ? (options.length ? "Choose project › lane" : "No other projects") : "Loading…"}
      </option>
      {options?.map((l) => (
        <option key={l.id} value={l.id}>
          {l.projectName} › {l.name}
        </option>
      ))}
    </select>
  );
}

// ---------- tasks ----------

function Tasks({ card, onChange }: { card: CardDTO; onChange: (c: CardDTO) => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const setTasks = (tasks: TaskDTO[]) => onChange({ ...card, tasks });

  return (
    <Section title={`Tasks ${card.tasks.length ? `· ${card.tasks.filter((t) => t.done).length}/${card.tasks.length}` : ""}`}>
      <ul className="space-y-1">
        {card.tasks.map((t) => (
          <li key={t.id} className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-slate-50">
            <input
              type="checkbox"
              checked={t.done}
              onChange={async () => {
                setTasks(card.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
                await updateTask(t.id, { done: !t.done });
              }}
              className="h-4 w-4 accent-indigo-600"
            />
            <span className={`flex-1 text-sm ${t.done ? "text-slate-400 line-through" : "text-slate-800"}`}>{t.title}</span>
            <input
              type="date"
              value={toDateInput(t.dueDate)}
              onChange={async (e) => {
                const dueDate = fromDateInput(e.target.value);
                setTasks(card.tasks.map((x) => (x.id === t.id ? { ...x, dueDate } : x)));
                await updateTask(t.id, { dueDate });
              }}
              className={`rounded border-0 bg-transparent text-xs ${
                t.dueDate && !t.done && isOverdue(t.dueDate) ? "text-red-600" : "text-slate-500"
              } ${t.dueDate ? "" : "opacity-0 group-hover:opacity-100"}`}
              title={t.dueDate ? dueLabel(t.dueDate) : "Set due date"}
            />
            <button
              onClick={async () => {
                setTasks(card.tasks.filter((x) => x.id !== t.id));
                await deleteTask(t.id);
              }}
              className="text-slate-300 opacity-0 group-hover:opacity-100 hover:text-red-600"
              title="Delete task"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          const task = await addTask(card.id, title, fromDateInput(due));
          setTasks([...card.tasks, task]);
          setTitle("");
          setDue("");
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="rounded-md border border-slate-300 px-2 text-sm text-slate-600"
        />
        <button className="rounded-md bg-slate-800 px-3 text-sm text-white hover:bg-slate-700">Add</button>
      </form>
    </Section>
  );
}

// ---------- notes ----------

function Notes({ card, onChange }: { card: CardDTO; onChange: (c: CardDTO) => void }) {
  const [body, setBody] = useState("");
  return (
    <Section title="Notes">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!body.trim()) return;
          const note = await addNote(card.id, body);
          onChange({ ...card, notes: [note, ...card.notes] });
          setBody("");
        }}
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
          }}
          rows={2}
          placeholder="Add a note… (Ctrl+Enter to save)"
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
        />
        {body.trim() && <button className="mt-1 rounded-md bg-slate-800 px-3 py-1 text-sm text-white hover:bg-slate-700">Save note</button>}
      </form>
      <ul className="mt-2 space-y-2">
        {card.notes.map((n) => (
          <li key={n.id} className="group rounded-md bg-amber-50 px-3 py-2">
            <p className="text-sm whitespace-pre-wrap text-slate-800">{n.body}</p>
            <div className="mt-1 flex text-xs text-slate-400">
              <span>{new Date(n.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
              <button
                onClick={async () => {
                  onChange({ ...card, notes: card.notes.filter((x) => x.id !== n.id) });
                  await deleteNote(n.id);
                }}
                className="ml-auto opacity-0 group-hover:opacity-100 hover:text-red-600"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------- emails ----------

function Emails({
  card,
  inbox,
  onChange,
  onSplit,
  onEmailSeen,
}: {
  card: CardDTO;
  inbox: ThreadSummary[];
  onChange: (c: CardDTO) => void;
  onSplit: (from: CardDTO, created: CardDTO) => void;
  onEmailSeen: (threadId: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(card.emails[0]?.threadId ?? null);
  const [linking, setLinking] = useState(false);
  const [filter, setFilter] = useState("");
  const linked = new Set(card.emails.map((e) => e.threadId));
  const candidates = inbox
    .filter((t) => !linked.has(t.threadId))
    .filter((t) => !filter || `${t.subject} ${t.from}`.toLowerCase().includes(filter.toLowerCase()))
    .slice(0, 8);

  return (
    <Section
      title={`Emails · ${card.emails.length}`}
      action={
        <button onClick={() => setLinking((v) => !v)} className="text-sm text-indigo-600 hover:underline">
          {linking ? "Done" : "+ Link email"}
        </button>
      }
    >
      {linking && (
        <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-2">
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter loaded inbox…"
            className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          {candidates.length === 0 && <p className="text-xs text-slate-500">No matching emails in the loaded inbox. Search in the inbox column first.</p>}
          {candidates.map((t) => (
            <button
              key={t.threadId}
              onClick={async () => onChange(await attachEmail(card.id, t))}
              className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-white"
            >
              <span className="font-medium">{senderName(t.from)}</span> <span className="text-slate-600">— {t.subject}</span>
            </button>
          ))}
        </div>
      )}
      {card.emails.length === 0 && <p className="text-sm text-slate-500">No emails linked yet.</p>}
      <div className="space-y-2">
        {card.emails.map((e) => (
          <div key={e.id} className="rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 px-3 py-2">
              <button onClick={() => setExpanded(expanded === e.threadId ? null : e.threadId)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-sm font-medium text-slate-800">{e.subject}</div>
                <div className="truncate text-xs text-slate-500">
                  {senderName(e.from)} · {shortDate(e.emailDate)}
                </div>
              </button>
              <a href={gmailLink(e.threadId)} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:text-indigo-600">
                Gmail ↗
              </a>
              {card.emails.length > 1 && (
                <button
                  onClick={async () => {
                    const res = await splitEmail(e.id);
                    onSplit(res.from, res.created);
                  }}
                  className="text-xs text-slate-500 hover:text-indigo-600"
                  title="Move this email into a new case of its own"
                >
                  Split out
                </button>
              )}
              <button
                onClick={async () => {
                  onChange({ ...card, emails: card.emails.filter((x) => x.id !== e.id) });
                  await detachEmail(e.id);
                }}
                className="text-xs text-slate-400 hover:text-red-600"
                title="Unlink email from this case"
              >
                ✕
              </button>
            </div>
            {expanded === e.threadId && (
              <div className="border-t border-slate-100 p-3">
                <ThreadView threadId={e.threadId} onLoaded={() => onEmailSeen(e.threadId)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}
