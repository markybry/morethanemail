"use client";

import { useState } from "react";
import { addNote, addTask, deleteNote, deleteTask, updateTask } from "@/app/actions";
import type { BoardEmail, LaneDTO, TaskDTO, ThreadSnapshot } from "@/lib/types";
import { dueLabel, fromDateInput, gmailLink, isOverdue, senderName, toDateInput } from "@/lib/format";
import { Drawer, DrawerHeader } from "./Drawer";
import { ThreadView } from "./ThreadView";
import { Section } from "./ui";

export const UNSORTED = "__unsorted";

type Props = {
  email: BoardEmail;
  lanes: LaneDTO[];
  laneId: string; // UNSORTED when not in a lane
  onPlace: (laneId: string) => void;
  onChange: (email: BoardEmail) => void;
  onSeen: () => void;
  onClose: () => void;
};

const snapshot = (e: BoardEmail): ThreadSnapshot => ({
  threadId: e.threadId,
  subject: e.subject,
  from: e.from,
  snippet: e.snippet,
  date: e.date,
});

// One email: where it sits in this workspace, its tasks and notes, and the thread itself.
export function EmailPanel({ email, lanes, laneId, onPlace, onChange, onSeen, onClose }: Props) {
  return (
    <Drawer onClose={onClose}>
      <DrawerHeader onClose={onClose}>
        <h2 className="text-lg font-semibold text-slate-900">{email.subject}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span>{senderName(email.from)}</span>
          <a href={gmailLink(email.threadId)} target="_blank" rel="noreferrer" className="hover:text-indigo-600">
            Open in Gmail ↗
          </a>
          <select
            value={laneId}
            onChange={(e) => onPlace(e.target.value)}
            className="ml-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700"
            aria-label="Lane"
          >
            <option value={UNSORTED}>Unsorted</option>
            {lanes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </DrawerHeader>

      <Tasks email={email} onChange={onChange} />
      <Notes email={email} onChange={onChange} />
      <Section title="Thread">
        <ThreadView threadId={email.threadId} onLoaded={onSeen} />
      </Section>
    </Drawer>
  );
}

function Tasks({ email, onChange }: { email: BoardEmail; onChange: (e: BoardEmail) => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const setTasks = (tasks: TaskDTO[]) => onChange({ ...email, tasks });

  return (
    <Section title={`Tasks ${email.tasks.length ? `· ${email.tasks.filter((t) => t.done).length}/${email.tasks.length}` : ""}`}>
      <ul className="space-y-1">
        {email.tasks.map((t) => (
          <li key={t.id} className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-slate-50">
            <input
              type="checkbox"
              checked={t.done}
              onChange={async () => {
                setTasks(email.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
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
                setTasks(email.tasks.map((x) => (x.id === t.id ? { ...x, dueDate } : x)));
                await updateTask(t.id, { dueDate });
              }}
              className={`rounded border-0 bg-transparent text-xs ${
                t.dueDate && !t.done && isOverdue(t.dueDate) ? "text-red-600" : "text-slate-500"
              } ${t.dueDate ? "" : "opacity-0 group-hover:opacity-100"}`}
              title={t.dueDate ? dueLabel(t.dueDate) : "Set due date"}
            />
            <button
              onClick={async () => {
                setTasks(email.tasks.filter((x) => x.id !== t.id));
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
          const task = await addTask(snapshot(email), title, fromDateInput(due));
          setTasks([...email.tasks, task]);
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

function Notes({ email, onChange }: { email: BoardEmail; onChange: (e: BoardEmail) => void }) {
  const [body, setBody] = useState("");
  return (
    <Section title="Notes">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!body.trim()) return;
          const note = await addNote(snapshot(email), body);
          onChange({ ...email, notes: [note, ...email.notes] });
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
        {email.notes.map((n) => (
          <li key={n.id} className="group rounded-md bg-amber-50 px-3 py-2">
            <p className="text-sm whitespace-pre-wrap text-slate-800">{n.body}</p>
            <div className="mt-1 flex text-xs text-slate-400">
              <span>{new Date(n.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
              <button
                onClick={async () => {
                  onChange({ ...email, notes: email.notes.filter((x) => x.id !== n.id) });
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
