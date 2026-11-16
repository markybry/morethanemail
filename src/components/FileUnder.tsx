"use client";

import { useEffect, useState } from "react";
import { useMail } from "./MailContext";

// Filing means giving it a label: only labelled things are kept in the List.
// Asked when something with no label is filed. Pick a label, or type a new one
// ("Clients/JR" nests it). Anything not worth a label is ignored or deleted instead.
export function FileUnder({
  count,
  onPick,
  onClose,
}: {
  count: number; // how many are being filed
  onPick: (label: { id: string } | { name: string }) => Promise<string | undefined>; // an error, if any
  onClose: () => void;
}) {
  const { labels, colorOf } = useMail();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const own = labels.filter((l) => l.id.startsWith("Label_"));
  const options = own.filter((l) => !q || l.name.toLowerCase().includes(q)).slice(0, 12);
  const exact = own.some((l) => l.name.toLowerCase() === q);

  const pick = async (label: { id: string } | { name: string }) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const err = await onPick(label);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh]">
      <div className="animate-fade-in absolute inset-0 bg-shadow/40 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="File under a label" className="animate-zoom-in relative w-full max-w-md rounded-3xl border border-line bg-cream p-4 shadow-2xl shadow-shadow/40">
        <h2 className="text-base font-bold text-walnut">File under…</h2>
        <p className="mt-0.5 text-xs text-muted">
          Only labelled things are filed. Pick a label for {count === 1 ? "this" : `these ${count}`}, or ignore or delete {count === 1 ? "it" : "them"} instead.
        </p>
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (options[0] && (exact || options.length === 1)) void pick({ id: (own.find((l) => l.name.toLowerCase() === q) ?? options[0]).id });
            else if (q) void pick({ name: query.trim() });
          }}
        >
          <input
            autoFocus
            value={query}
            disabled={busy}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or create a label…"
            className="field w-full rounded-xl px-2.5 py-1.5 text-sm"
          />
        </form>
        <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
          {options.map((l) => (
            <li key={l.id}>
              <button
                disabled={busy}
                onClick={() => void pick({ id: l.id })}
                className="list-row flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-bark hover:text-terracotta disabled:opacity-50"
              >
                <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: colorOf(l.id) }} />
                <span className="truncate">{l.name.split("/").join(" › ")}</span>
              </button>
            </li>
          ))}
          {q && !exact && (
            <li>
              <button
                disabled={busy}
                onClick={() => void pick({ name: query.trim() })}
                className="w-full truncate rounded-xl px-3 py-1.5 text-left text-sm font-semibold text-terracotta hover:bg-oat disabled:opacity-50"
              >
                + Create label “{query.trim().split("/").join(" › ")}”
              </button>
            </li>
          )}
          {!q && own.length === 0 && <li className="px-1 text-sm text-muted">No labels yet: type a name to create one.</li>}
        </ul>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <div className="mt-3 flex justify-end">
          <button onClick={onClose} className="text-sm font-semibold text-muted hover:text-bark">
            {busy ? "Filing…" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
