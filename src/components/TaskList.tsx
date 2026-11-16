"use client";

import { useState } from "react";
import Link from "next/link";
import { addStandaloneTask, deleteTask, updateTask } from "@/app/actions";
import { dueLabel, isOverdue } from "@/lib/format";
import { DueChips, DuePicker, type Due } from "./DuePicker";
import { ConfirmButton, InlineEdit } from "./ui";

export type TaskRowData = {
  id: string;
  title: string;
  notes: string;
  done: boolean;
  dueDate: string | null;
  dueTime: boolean;
  // Where the task lives, if it's on an email or ticket.
  from: { href: string; text: string } | null;
};

// Add a task that isn't on any email.
export function QuickAddTask() {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<Due>({ dueDate: null, dueTime: false });
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card-tactile mt-4 flex flex-wrap items-center gap-2 rounded-2xl p-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        try {
          await addStandaloneTask(title, due.dueDate, due.dueTime);
          setTitle("");
          setDue({ dueDate: null, dueTime: false });
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        value={title}
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a next action…"
        className="field min-w-0 flex-1 rounded-xl px-2.5 py-1.5 text-sm"
      />
      <DuePicker value={due} onChange={setDue} variant="field" />
      <button disabled={busy || !title.trim()} className="btn-press rounded-xl bg-moss px-3 py-1.5 text-sm font-bold text-cream disabled:opacity-50">
        Add
      </button>
      <div className="basis-full">
        <DueChips value={due} onChange={setDue} />
      </div>
    </form>
  );
}

// One task on My tasks: tick it, rename it, change its date, add details.
export function TaskRow({ task }: { task: TaskRowData }) {
  const [t, setT] = useState(task);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(task.notes);
  const save = async (patch: Partial<Pick<TaskRowData, "done" | "title" | "notes" | "dueDate" | "dueTime">>) => {
    setT((prev) => ({ ...prev, ...patch }));
    await updateTask(t.id, patch);
  };

  return (
    <li className="list-row px-3 py-2">
      <div className="flex items-center gap-3">
        <input type="checkbox" checked={t.done} onChange={() => save({ done: !t.done })} className="h-4 w-4 shrink-0 accent-moss" />
        <div className="min-w-0 flex-1">
          <div className={`flex text-sm ${t.done ? "text-muted line-through" : "text-walnut"}`}>
            <InlineEdit value={t.title} onSave={(title) => save({ title })} />
          </div>
          {t.from && (
            <Link href={t.from.href} className="block truncate text-xs text-muted hover:text-terracotta">
              {t.from.text}
            </Link>
          )}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className={`shrink-0 text-xs ${t.notes ? "text-bark" : "text-muted"} hover:text-terracotta`}
          title="Details"
        >
          {t.notes ? "✎ details" : "✎"}
        </button>
        {t.dueDate && !open && (
          <span className={`shrink-0 text-xs ${!t.done && isOverdue(t.dueDate, t.dueTime) ? "text-red-600" : "text-muted"}`}>
            {dueLabel(t.dueDate, t.dueTime)}
          </span>
        )}
      </div>
      {open && (
        <div className="mt-2 space-y-2 pl-7">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== t.notes && save({ notes })}
            rows={3}
            placeholder="Details…"
            className="field w-full rounded-xl px-2.5 py-1.5 text-sm"
          />
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">Due</span>
            <DuePicker value={{ dueDate: t.dueDate, dueTime: t.dueTime }} onChange={save} variant="field" align="left" done={t.done} />
            <div className="ml-auto">
              <ConfirmButton label="Delete" confirmLabel="Delete action?" onConfirm={() => deleteTask(t.id)} small />
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
