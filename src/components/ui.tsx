"use client";

import { useEffect, useState } from "react";

// Text that becomes an input on click; saves on Enter or blur.
export function InlineEdit({ value, onSave, className = "" }: { value: string; onSave: (v: string) => unknown; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  if (!editing)
    return (
      <button onClick={() => setEditing(true)} className={`min-w-0 truncate text-left hover:text-indigo-700 ${className}`} title="Click to rename">
        {value}
      </button>
    );

  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== value) void onSave(v);
    else setDraft(value);
  };
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className={`min-w-0 flex-1 rounded border border-indigo-400 bg-white px-1 outline-none ${className}`}
    />
  );
}

// A destructive button that asks for a second click instead of a browser dialog.
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  small,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => unknown;
  small?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      onClick={() => (armed ? (setArmed(false), void onConfirm()) : setArmed(true))}
      className={`rounded ${small ? "px-1 text-xs" : "px-2 py-1 text-sm"} ${
        armed ? "bg-red-600 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-red-600"
      }`}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-t border-slate-200 px-5 py-4">
      <div className="mb-2 flex items-center">
        <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </section>
  );
}
