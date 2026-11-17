"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchWaiting, notWaiting, type Waiting } from "@/app/actions";
import { senderName, timeAgo } from "@/lib/format";
import { Loading } from "./Loading";

const NUDGE_DAYS = 3;
const cardLink = (threadId: string) => `/l/INBOX?thread=${encodeURIComponent(threadId)}`;

// Emails you sent that nobody has answered yet: the newest message in the thread
// is yours. Oldest first; each leaves the list by itself when a reply arrives, or
// with "No reply needed" for the ones that didn't ask for one.
export function WaitingForReplies({
  keep = () => true,
  onOpen,
}: {
  keep?: (w: Waiting) => boolean; // e.g. only the open label's
  onOpen?: (threadId: string) => void; // open in place, instead of following a link
}) {
  const [items, setItems] = useState<Waiting[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetchWaiting().then((res) => {
      if (res.error) setError(res.error);
      setItems(res.items);
    });
  }, []);

  const dismiss = async (w: Waiting) => {
    const before = items;
    setItems((prev) => prev?.filter((x) => x.messageId !== w.messageId) ?? null);
    const res = await notWaiting(w.messageId);
    if (res.error) {
      setItems(before);
      setError(res.error);
    }
  };

  const days = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  const shown = items?.filter(keep) ?? null;
  const nudges = shown?.filter((w) => days(w.date) >= NUDGE_DAYS).length ?? 0;

  return (
    <section className="paper animate-rise rounded-3xl border border-line p-4">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-terracotta">⏳ Waiting for a reply</h2>
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
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      w.done ? "bg-ok-bg text-ok-ink" : w.status ? "bg-info-bg text-info-ink" : "border border-dashed border-line-strong"
                    }`}
                    title={w.done ? "Its card is done on the Workspace" : w.status ? "Its card's status on the Workspace" : "Not tracked on the Workspace"}
                  >
                    {w.done ? `✓ ${w.status}` : (w.status ?? "Not on the board")}
                  </span>
                  <span className="truncate">To {w.to.map(senderName).join(", ") || "(no one)"}</span>
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${nudge ? "bg-warn-bg text-warn-ink" : "text-muted"}`}
                title={`Sent ${new Date(w.date).toLocaleString()}`}
              >
                {nudge ? `${d} days · nudge?` : timeAgo(w.date)}
              </span>
              <button
                onClick={() => void dismiss(w)}
                className="shrink-0 text-xs font-semibold text-muted opacity-0 group-hover:opacity-100 hover:text-terracotta focus:opacity-100 max-md:opacity-100"
                title="This one doesn't need an answer: stop tracking it"
              >
                No reply needed
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
