"use client";

import { useState } from "react";
import Link from "next/link";
import { addStandaloneTask, deleteTask, updateTask } from "@/app/actions";
import { dueLabel, fromDateInput, isOverdue, toDateInput } from "@/lib/format";
import { ConfirmButton, InlineEdit } from "./ui";

export type TaskRowData = {
  id: string;
  title: string;
  notes: string;
  done: boolean;
  dueDate: string | null;
  // Where the task lives, if it's on an email or ticket.
  from: { href: string; text: string } | null;
};

// Add a task that isn't on any email.
export function QuickAddTask() {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card-tactile mt-4 flex flex-wrap items-center gap-2 rounded-2xl p-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        try {
          await addStandaloneTask(title, fromDateInput(due));
          setTitle("");
          setDue("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        value={title}
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task…"
        className="field min-w-0 flex-1 rounded-xl px-2.5 py-1.5 text-sm"
      />
      <input
        type="date"
        value={due}
        disabled={busy}
        onChange={(e) => setDue(e.target.value)}
        className="field rounded-xl px-2 py-1.5 text-sm text-bark"
        aria-label="Due date"
      />
      <button disabled={busy || !title.trim()} className="btn-press rounded-xl bg-moss px-3 py-1.5 text-sm font-bold text-cream disabled:opacity-50">
        Add
      </button>
    </form>
  );
}

// One task on My tasks: tick it, rename it, change its date, add details.
export function TaskRow({ task }: { task: TaskRowData }) {
  const [t, setT] = useState(task);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(task.notes);
  const save = async (patch: Partial<Pick<TaskRowData, "done" | "title" | "notes" | "dueDate">>) => {
    setT((prev) => ({ ...prev, ...patch }));
    await updateTask(t.id, patch);
  };

  return (
    <li className="px-3 py-2">
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
          <span className={`shrink-0 text-xs ${!t.done && isOverdue(t.dueDate) ? "text-red-600" : "text-muted"}`}>{dueLabel(t.dueDate)}</span>
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
            <label className="flex items-center gap-1.5 text-muted">
              Due
              <input
                type="date"
                value={toDateInput(t.dueDate)}
                onChange={(e) => save({ dueDate: fromDateInput(e.target.value) })}
                className="field rounded-xl px-2 py-1 text-bark"
              />
            </label>
            <div className="ml-auto">
              <ConfirmButton label="Delete" confirmLabel="Delete task?" onConfirm={() => deleteTask(t.id)} small />
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
