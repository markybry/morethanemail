"use client";

import { useEffect, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { addTask, deleteTask, reorderTasks, updateTask } from "@/app/actions";
import type { BoardEmail, TaskDTO, ThreadSnapshot } from "@/lib/types";
import { nextAction } from "@/lib/cards";
import { DueChips, DuePicker, type Due } from "./DuePicker";
import { InlineEdit, Section } from "./ui";

const NO_DUE: Due = { dueDate: null, dueTime: false };

type Props = { email: BoardEmail; snapshot: ThreadSnapshot; onChange: (e: BoardEmail) => void };

function useTaskEdits({ email, onChange }: Props) {
  const setTasks = (tasks: TaskDTO[]) => onChange({ ...email, tasks });
  const patch = async (id: string, p: Partial<Pick<TaskDTO, "done" | "title" | "dueDate" | "dueTime">>) => {
    setTasks(email.tasks.map((x) => (x.id === id ? { ...x, ...p } : x)));
    await updateTask(id, p);
  };
  const remove = async (id: string) => {
    setTasks(email.tasks.filter((x) => x.id !== id));
    await deleteTask(id);
  };
  return { setTasks, patch, remove };
}

// The one thing to do next on this card: the top open task of the list below.
// Ticking it off brings up the next one.
export function NextAction(p: Props) {
  const { email, snapshot } = p;
  const { setTasks, patch } = useTaskEdits(p);
  const next = nextAction(email.tasks);
  const open = email.tasks.filter((t) => !t.done);
  const after = open[1];
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<Due>(NO_DUE);
  // A little "done!" floats up when the next action is ticked off.
  const [cheer, setCheer] = useState(0);
  useEffect(() => {
    if (!cheer) return;
    const t = setTimeout(() => setCheer(0), 1100);
    return () => clearTimeout(t);
  }, [cheer]);

  return (
    <Section title="Next action">
      <div className="relative">
      {cheer > 0 && (
        <span key={cheer} className="animate-cheer pointer-events-none absolute -top-3 left-3 z-10 rounded-full bg-moss px-2 py-0.5 text-xs font-bold text-cream shadow">
          ✓ Done!
        </span>
      )}
      {next ? (
        <>
          <div key={next.id} className="animate-slide-up flex items-center gap-2.5 rounded-xl border border-line bg-paper px-3 py-2">
            <input
              type="checkbox"
              checked={false}
              onChange={() => {
                setCheer(Date.now());
                void patch(next.id, { done: true });
              }}
              className="h-5 w-5 shrink-0 accent-moss transition active:scale-125"
              aria-label={`Done: ${next.title}`}
              title="Done: the next task on the list moves up"
            />
            <div className="flex min-w-0 flex-1 text-base font-semibold text-walnut">
              <InlineEdit value={next.title} onSave={(t) => patch(next.id, { title: t })} />
            </div>
            <DuePicker
              value={{ dueDate: next.dueDate, dueTime: next.dueTime }}
              onChange={(d) => patch(next.id, d)}
              className={next.dueDate ? "" : "text-xs"}
            />
          </div>
          <p className="mt-1 truncate text-xs text-muted">
            {after ? (
              <>
                Then: {after.title}
                {open.length > 2 && ` · ${open.length - 2} more in Tasks below`}
              </>
            ) : (
              "Nothing after this. Add more in Tasks below."
            )}
          </p>
        </>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            const task = await addTask(snapshot, title, due.dueDate, due.dueTime, true);
            setTasks([task, ...email.tasks]);
            setTitle("");
            setDue(NO_DUE);
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={email.tasks.length ? "All done. What's next?" : "What's the next action?"}
            className="field min-w-0 flex-1 rounded-xl px-2.5 py-1.5 text-sm"
          />
          <DuePicker value={due} onChange={setDue} variant="field" />
          <button className="btn-press rounded-xl bg-terracotta px-3 text-sm font-bold text-cream">Set</button>
        </form>
      )}
      {!next && <DueChips value={due} onChange={setDue} />}
      </div>
    </Section>
  );
}

// Every task on the card, in order. Drag to reorder; the top open one is the next action.
export function TaskList(p: Props) {
  const { email, snapshot } = p;
  const { setTasks, patch, remove } = useTaskEdits(p);
  const open = email.tasks.filter((t) => !t.done);
  const done = email.tasks.filter((t) => t.done);
  const [showDone, setShowDone] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<Due>(NO_DUE);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reorder = async (ids: string[]) => {
    const byId = new Map(email.tasks.map((t) => [t.id, t]));
    const tasks = [...ids.map((id) => byId.get(id)!), ...done];
    setTasks(tasks);
    await reorderTasks(tasks.map((t) => t.id));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = open.map((t) => t.id);
    void reorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  return (
    <Section title={`Tasks${email.tasks.length ? ` · ${done.length}/${email.tasks.length} done` : ""}`}>
      {open.length === 0 && <p className="mb-1 text-sm text-muted">No open tasks.</p>}
      <DndContext id={`tasks-${email.threadId}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={open.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-0.5">
            {open.map((t, i) => (
              <SortableTask
                key={t.id}
                task={t}
                isNext={i === 0}
                onPatch={(x) => patch(t.id, x)}
                onRemove={() => remove(t.id)}
                onMakeNext={i > 0 ? () => reorder([t.id, ...open.map((o) => o.id).filter((id) => id !== t.id)]) : undefined}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <form
        className="mt-2 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          const task = await addTask(snapshot, title, due.dueDate, due.dueTime);
          setTasks([...email.tasks, task]);
          setTitle("");
          setDue(NO_DUE);
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          className="field min-w-0 flex-1 rounded-xl px-2.5 py-1.5 text-sm"
        />
        <DuePicker value={due} onChange={setDue} variant="field" />
        <button className="btn-press rounded-xl bg-moss px-3 text-sm font-bold text-cream">Add</button>
      </form>
      {title.trim() && <DueChips value={due} onChange={setDue} />}

      {done.length > 0 && (
        <div className="mt-2">
          <button onClick={() => setShowDone((v) => !v)} className="text-xs text-muted hover:text-bark" aria-expanded={showDone}>
            {showDone ? "▾" : "▸"} {done.length} done
          </button>
          {showDone && (
            <ul className="mt-1 space-y-0.5">
              {done.map((t) => (
                <li key={t.id} className="group flex items-center gap-2 rounded px-1 py-0.5 pl-6 hover:bg-oat">
                  <input
                    type="checkbox"
                    checked
                    onChange={() => patch(t.id, { done: false })}
                    className="h-4 w-4 shrink-0 accent-moss"
                    aria-label={`Not done: ${t.title}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-muted line-through">{t.title}</span>
                  <RemoveButton onClick={() => remove(t.id)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
  );
}

function SortableTask({
  task: t,
  isNext,
  onPatch,
  onRemove,
  onMakeNext,
}: {
  task: TaskDTO;
  isNext: boolean;
  onPatch: (p: Partial<Pick<TaskDTO, "done" | "title" | "dueDate" | "dueTime">>) => void;
  onRemove: () => void;
  onMakeNext?: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: t.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group animate-rise flex items-center gap-2 rounded px-1 py-0.5 hover:bg-oat ${isDragging ? "relative z-10 bg-oat shadow-md" : ""}`}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none px-0.5 text-faint hover:text-bark active:cursor-grabbing"
        aria-label={`Reorder: ${t.title}`}
        title="Drag to reorder"
      >
        ⠿
      </button>
      <input
        type="checkbox"
        checked={false}
        onChange={() => onPatch({ done: true })}
        className="h-4 w-4 shrink-0 accent-moss transition active:scale-125"
        aria-label={`Done: ${t.title}`}
      />
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-walnut">
        {isNext && <span className="shrink-0 rounded-full bg-accent-soft px-1.5 text-[10px] font-bold tracking-wide text-accent-ink uppercase">Next</span>}
        <InlineEdit value={t.title} onSave={(title) => onPatch({ title })} />
      </div>
      {onMakeNext && (
        <button
          onClick={onMakeNext}
          className="shrink-0 text-xs text-muted opacity-0 group-hover:opacity-100 hover:text-terracotta focus:opacity-100 max-md:opacity-100"
          title="Move to the top: make this the next action"
        >
          ↑ Next
        </button>
      )}
      <DuePicker
        value={{ dueDate: t.dueDate, dueTime: t.dueTime }}
        onChange={onPatch}
        className={t.dueDate ? "" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100"}
      />
      <RemoveButton onClick={onRemove} />
    </li>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 text-faint opacity-0 group-hover:opacity-100 hover:text-red-600 focus:opacity-100 max-md:opacity-100"
      title="Delete task"
      aria-label="Delete task"
    >
      ✕
    </button>
  );
}
