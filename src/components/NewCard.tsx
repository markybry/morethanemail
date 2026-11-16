"use client";

import { useState } from "react";

// A one-line box for a new card with no email. Enter adds it (and stays open
// for the next one), Escape or a click away with nothing typed closes it.
export function NewCardForm({
  placeholder = "What needs doing?",
  onCreate,
  onClose,
  children,
  className = "",
}: {
  placeholder?: string;
  onCreate: (title: string) => Promise<void>;
  onClose: () => void;
  children?: React.ReactNode; // extra controls under the box, e.g. a date
  className?: string;
}) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className={`animate-drop-in space-y-1.5 ${className}`}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim() || busy) return;
        setBusy(true);
        setError("");
        try {
          await onCreate(title.trim());
          setTitle("");
        } catch {
          setError("Couldn't add it. Try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex gap-1.5">
        <input
          autoFocus
          value={title}
          disabled={busy}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          onBlur={() => !title.trim() && !children && onClose()}
          placeholder={placeholder}
          className="field min-w-0 flex-1 rounded-xl px-2.5 py-1.5 text-sm"
        />
        <button disabled={busy || !title.trim()} className="btn-press rounded-xl bg-moss px-2.5 text-sm font-bold text-cream disabled:opacity-50">
          {busy ? "…" : "Add"}
        </button>
        <button type="button" onClick={onClose} className="px-1 text-sm text-muted hover:text-bark" aria-label="Cancel">
          ✕
        </button>
      </div>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
