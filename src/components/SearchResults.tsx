"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { searchEverything, type CardHit } from "@/app/actions";
import type { BoardEmail } from "@/lib/types";
import { senderName, shortDate } from "@/lib/format";
import { useMail } from "./MailContext";

const cardLink = (threadId: string) => `/l/INBOX?thread=${encodeURIComponent(threadId)}`;

export function SearchResults({ query }: { query: string }) {
  const [emails, setEmails] = useState<BoardEmail[] | null>(null);
  const [cards, setCards] = useState<CardHit[]>([]);
  const [next, setNext] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (pageToken?: string) => {
      setBusy(true);
      const res = await searchEverything(query, pageToken);
      setBusy(false);
      if (res.error) setError(res.error);
      if (!pageToken) setCards(res.cards);
      setEmails((prev) => (pageToken ? [...(prev ?? []), ...res.emails.filter((e) => !prev?.some((p) => p.threadId === e.threadId))] : res.emails));
      setNext(res.nextPageToken);
    },
    [query],
  );

  useEffect(() => {
    if (query.trim()) void load();
  }, [query, load]);

  if (!query.trim())
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <p className="text-sm text-muted">Type in the search bar to search all your mail and cards.</p>
      </div>
    );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
        <h1 className="text-xl font-semibold text-walnut">
          Search: <span className="text-bark">{query}</span>
        </h1>
        {error && <p className="text-sm text-red-600">{error}</p>}

        {cards.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Cards</h2>
            <ul className="space-y-1.5">
              {cards.map((c, i) => (
                <li key={c.threadId} className="list-row animate-rise" style={{ animationDelay: `${Math.min(i, 15) * 25}ms` }}>
                  <Link href={cardLink(c.threadId)} className="group flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-walnut group-hover:text-terracotta">{c.title}</span>
                      <span className="block truncate text-xs text-muted">
                        {c.local ? "✎ Ticket" : senderName(c.from)}
                        {c.where && ` · ${c.where}`}
                      </span>
                    </span>
                    <span className="w-14 shrink-0 text-right text-xs text-muted">{shortDate(c.date)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Mail</h2>
          {!emails ? (
            <p className="text-sm text-muted">Searching…</p>
          ) : emails.length === 0 ? (
            <p className="text-sm text-muted">No emails match.</p>
          ) : (
            <ul className="space-y-1.5">
              {emails.map((e, i) => (
                <EmailRow key={e.threadId} email={e} i={i} />
              ))}
            </ul>
          )}
          {next && (
            <button
              disabled={busy}
              onClick={() => void load(next)}
              className="btn-press mt-2 w-full rounded-xl bg-oat p-2 text-sm font-semibold text-bark disabled:opacity-50"
            >
              {busy ? "Loading…" : "Load more"}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

function EmailRow({ email: e, i }: { email: BoardEmail; i: number }) {
  const { labelNames, colorOf } = useMail();
  const named = e.labelIds.map((id) => ({ id, name: labelNames.get(id) })).filter((l): l is { id: string; name: string } => !!l.name);
  const labels = named.filter((l) => !named.some((o) => o.name.startsWith(`${l.name}/`))).slice(0, 3);
  return (
    <li className="list-row animate-rise" style={{ animationDelay: `${Math.min(i % 30, 15) * 25}ms` }}>
      <Link href={cardLink(e.threadId)} className="group flex items-center gap-3 px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${e.unread ? "font-bold text-walnut" : "text-ink"}`}>
            <span className="font-semibold">{senderName(e.from)}</span>
            <span className="text-muted"> · </span>
            <span className="group-hover:text-terracotta">{e.subject}</span>
          </span>
          <span className="block truncate text-xs text-muted">{e.snippet}</span>
        </span>
        <span className="hidden shrink-0 gap-1 sm:flex">
          {e.labelIds.includes("INBOX") && (
            <span className="rounded-full bg-info-bg px-2 py-0.5 text-[11px] font-semibold text-info-ink">Inbox</span>
          )}
          {e.partOf && <span className="rounded-full bg-info-bg px-2 py-0.5 text-[11px] font-semibold text-info-ink">On a card</span>}
          {labels.map((l) => (
            <span key={l.id} className="rounded-full border border-line bg-paper px-2 py-0.5 text-[11px] font-semibold text-bark">
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: colorOf(l.id) }} />
              {l.name.split("/").join(" › ")}
            </span>
          ))}
        </span>
        <span className="w-14 shrink-0 text-right text-xs text-muted">{shortDate(e.date)}</span>
      </Link>
    </li>
  );
}
