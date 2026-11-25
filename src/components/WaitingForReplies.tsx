"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchWaiting, notWaiting, type Waiting } from "@/app/actions";
import { senderName, timeAgo } from "@/lib/format";
import { Loading } from "./Loading";
import { cached, isFresh, remember } from "@/lib/clientCache";

const NUDGE_DAYS = 3;
const CACHE_KEY = "waiting";
const FRESH_MS = 5 * 60_000; // a list this recent is shown without asking Gmail again
const cardLink = (threadId: string) => `/l/INBOX?thread=${encodeURIComponent(threadId)}`;

// Emails you sent that nobody has answered yet: the newest message in the thread
// is yours. Oldest first; each leaves the list by itself when a reply arrives, or
// with "No reply needed" for the ones that didn't ask for one.
export function WaitingForReplies({
  keep = () => true,
  onOpen,
  onAddToBoard,
  onFile,
  onTrash,
  firstLaneName = "the board",
  className = "paper animate-rise rounded-3xl border border-line p-4",
}: {
  keep?: (w: Waiting) => boolean; // e.g. only the open label's
  onOpen?: (threadId: string) => void; // open in place, instead of following a link
  onAddToBoard?: (threadId: string) => void | Promise<void>; // place it in the board's first status
  onFile?: (threadId: string) => Promise<boolean>; // file it (asks for a label first when needed); true once filed
  onTrash?: (threadId: string) => Promise<boolean>; // to Gmail's Trash; true once there
  firstLaneName?: string; // name of the first status on the board
  className?: string; // a host can drop the card surface when it has its own
}) {
  // Last time's list shows straight away; the fresh one replaces it.
  const [items, setItemsState] = useState<Waiting[] | null>(() => cached<Waiting[]>(CACHE_KEY) ?? null);
  const setItems = (next: Waiting[] | null | ((prev: Waiting[] | null) => Waiting[] | null)) =>
    setItemsState((prev) => {
      const v = typeof next === "function" ? next(prev) : next;
      if (v) remember(CACHE_KEY, v);
      return v;
    });
  const [error, setError] = useState("");
  const [added, setAdded] = useState<string[]>([]);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (isFresh(CACHE_KEY, FRESH_MS)) return; // fetched moments ago: no need to ask Gmail
    void fetchWaiting().then((res) => {
      if (res.error) setError(res.error);
      else setError("");
      if (!res.error || !cached(CACHE_KEY)) {
        setItemsState(res.items);
        if (!res.error) remember(CACHE_KEY, res.items, true);
      }
    });
  }, []); // once per mount

  const dismiss = async (w: Waiting) => {
    const before = items;
    setItems((prev) => prev?.filter((x) => x.messageId !== w.messageId) ?? null);
    const res = await notWaiting(w.messageId);
    if (res.error) {
      setItems(before);
      setError(res.error);
    }
  };

  // Filed (dealt with) or trashed: off the list now. Filed ones stay off, as with
  // "No reply needed"; trashed ones drop out of the sent mail by themselves.
  const drop = (w: Waiting, remember: boolean) => {
    setItems((prev) => prev?.filter((x) => x.messageId !== w.messageId) ?? null);
    if (remember)
      void notWaiting(w.messageId).then((res) => {
        if (res.error) setError(res.error);
      });
  };

  const run = async (key: string, w: Waiting, fn: (id: string) => void | Promise<boolean | void>) => {
    const threadId = w.threadId;
    setBusy(key);
    try {
      const ok = await fn(threadId);
      if (key.startsWith("board:")) setAdded((prev) => (prev.includes(threadId) ? prev : [...prev, threadId]));
      if (ok && key.startsWith("file:")) drop(w, true);
      if (ok && key.startsWith("trash:")) drop(w, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy("");
    }
  };

  const days = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  const shown = items?.filter(keep) ?? null;
  const nudges = shown?.filter((w) => days(w.date) >= NUDGE_DAYS).length ?? 0;

  return (
    <section className={className}>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-terracotta">↩︎ Waiting for a reply</h2>
        {shown && shown.length > 0 && (
          <span className="text-xs text-muted">
            {shown.length} sent, no answer yet{nudges > 0 && ` · ${nudges} waiting ${NUDGE_DAYS}+ days`}
          </span>
        )}
      </div>
      {!items && !error && <Loading text="Checking your sent mail" />}
      {error && <p className="text-sm text-bad-ink">{error}</p>}
      {shown?.length === 0 && <p className="text-sm text-muted">Nobody owes you a reply. Emails you send show here until they answer.</p>}
      <ul className="space-y-1.5">
        {shown?.map((w, i) => {
          const d = days(w.date);
          const nudge = d >= NUDGE_DAYS;
          return (
            <li
              key={w.messageId}
              className={`list-row group animate-rise flex items-center gap-3 px-3 py-2 ${nudge ? "border-l-4 border-l-mustard" : ""}`}
              style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
            >
              <div className="min-w-0 flex-1">
                {onOpen ? (
                  <button
                    onClick={() => onOpen(w.cardId ?? w.threadId)}
                    className="block max-w-full truncate text-left text-sm font-semibold text-walnut hover:text-terracotta"
                  >
                    {w.subject || "(no subject)"}
                  </button>
                ) : (
                  <Link href={cardLink(w.cardId ?? w.threadId)} className="block truncate text-sm font-semibold text-walnut hover:text-terracotta">
                    {w.subject || "(no subject)"}
                  </Link>
                )}
                <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                  {/* Where it is on the Workspace. */}
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${
                      w.done ? "bg-ok-bg text-ok-ink" : w.status ? "bg-info-bg text-info-ink" : "border border-dashed border-line-strong"
                    }`}
                    title={w.done ? "Its card is done on the Workspace" : w.status ? "Its card's status on the Workspace" : "Not tracked on the Workspace"}
                  >
                    {w.done ? `✓ ${w.status}` : (w.status ?? "Not on the board")}
                  </span>
                  <span className="truncate">To {w.to.map(senderName).join(", ") || "(no one)"}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${nudge ? "bg-warn-bg text-warn-ink" : "text-muted"}`}
                  title={`Sent ${new Date(w.date).toLocaleString()}`}
                >
                  {nudge ? `${d} days · nudge?` : timeAgo(w.date)}
                </span>
                <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100">
                  {onFile && (
                    <button
                      onClick={() => void run(`file:${w.messageId}`, w, onFile)}
                      disabled={!!busy}
                      className="btn-press rounded-lg bg-oat px-1.5 py-0.5 text-sm leading-none disabled:opacity-50"
                      title="Dealt with: file it under a label (asks first if it has none) and stop waiting on it. Gmail is left alone."
                      aria-label="File"
                    >
                      👍
                    </button>
                  )}
                  {onAddToBoard && !w.status && !w.done && !added.includes(w.threadId) && (
                    <button
                      onClick={() => void run(`board:${w.messageId}`, w, onAddToBoard)}
                      disabled={!!busy}
                      className="btn-press rounded-lg bg-oat px-1.5 py-0.5 text-sm leading-none disabled:opacity-50"
                      title={`Add this to ${firstLaneName} on the board (it isn't on one yet).`}
                      aria-label="Add to board"
                    >
                      📋
                    </button>
                  )}
                  {onTrash && (
                    <button
                      onClick={() => void run(`trash:${w.messageId}`, w, onTrash)}
                      disabled={!!busy}
                      className="btn-press rounded-lg bg-oat px-1.5 py-0.5 text-sm leading-none disabled:opacity-50"
                      title="Move to Gmail's Trash"
                      aria-label="Delete"
                    >
                      ❌
                    </button>
                  )}
                  <button
                    onClick={() => void dismiss(w)}
                    className="text-xs font-semibold text-muted hover:text-terracotta"
                    title="This one doesn't need an answer: stop tracking it"
                  >
                    No reply needed
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
