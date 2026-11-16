"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchFiled, fetchLabelEmails } from "@/app/actions";
import type { BoardEmail, FiledCard } from "@/lib/types";
import { cardLabelIds } from "@/lib/cards";
import { senderName, shortDate } from "@/lib/format";
import { useMail } from "./MailContext";
import { NewCardForm } from "./NewCard";

// Everything under the label (all labelled mail in the Workspace), older mail
// included, plus cards filed by hand and cards that are done. Cards show their
// status; rows that are just an email, with nothing added, are marked so.
export function ListView({
  labelId,
  isInbox,
  labelName,
  emails,
  inLens,
  statusOf,
  mergeEmails,
  onDoneLanes,
  onOpen,
  onUnfile,
  onNew,
}: {
  labelId: string;
  isInbox: boolean;
  labelName: string;
  emails: Record<string, BoardEmail>;
  inLens: (e: BoardEmail | undefined) => boolean;
  statusOf: (threadId: string) => string | undefined;
  mergeEmails: (list: BoardEmail[]) => void;
  onDoneLanes: (laneOf: Record<string, string>) => void; // so an opened Done card shows its status
  onOpen: (threadId: string) => void;
  onUnfile: (threadId: string) => void;
  onNew: (title: string) => Promise<BoardEmail>; // a new card kept as information, filed in the List
}) {
  const [done, setDone] = useState<FiledCard[] | null>(null);
  const [filed, setFiled] = useState<FiledCard[] | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchFiled().then((res) => {
      if (!live) return;
      if (res.error) setError(res.error);
      // Cards already on the board keep their live state; the rest join it so they can be opened.
      mergeEmails([...res.done, ...res.filed].map((f) => f.card).filter((c) => !emails[c.threadId]));
      onDoneLanes(Object.fromEntries(res.done.map((d) => [d.card.threadId, d.laneId!])));
      setDone(res.done);
      setFiled(res.filed);
    });
    return () => {
      live = false;
    };
    // Load once each time the view opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Read cards from the board's state so changes made in the open card show here.
  const view = (list: FiledCard[] | null, keep: (e: BoardEmail) => boolean) =>
    (list ?? []).map((f) => ({ ...f, card: emails[f.card.threadId] ?? f.card })).filter((f) => inLens(f.card) && keep(f.card));
  // A done card's status name (Done, Resolved…), by its finished status.
  const doneStatus = useMemo(() => new Map((done ?? []).map((d) => [d.laneId!, d.status!])), [done]);
  // Cards the mail list below won't include, shown first: cards with no email, and
  // filed or done emails without the label (or, in the Workspace, without any label).
  const covered = (e: BoardEmail) =>
    !e.local && (isInbox ? cardLabelIds(e).some((id) => id.startsWith("Label_")) : inLens(e));
  const pinned = [...view(filed, (e) => e.hidden && !covered(e)), ...view(done, (e) => e.done && !covered(e))];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-muted">
          {isInbox ? "Everything under your labels" : `Everything labelled ${labelName}`}, older mail included, plus cards filed or done. ✉
          marks a plain email with nothing added.
        </p>
        <button
          onClick={() => setAdding(true)}
          className="btn-press ml-auto rounded-xl bg-moss px-3 py-1 text-sm font-bold text-cream"
          title="A new card kept as information: notes, links, reference"
        >
          + New
        </button>
      </div>

      {adding && (
        <NewCardForm
          className="mb-2"
          placeholder="Something to keep: a note, a link, a reference…"
          onCreate={async (t) => {
            const card = await onNew(t);
            setFiled((prev) => [{ card, at: new Date().toISOString() }, ...(prev ?? [])]);
          }}
          onClose={() => setAdding(false)}
        />
      )}
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <div className="paper min-h-0 flex-1 overflow-y-auto rounded-2xl border border-line">
        {done && filed && (
          <AllMail
            labelId={isInbox ? "ALL" : labelId}
            hideLabelId={isInbox ? undefined : labelId}
            pinned={pinned.map((f) => f.card)}
            doneStatus={doneStatus}
            emails={emails}
            statusOf={statusOf}
            mergeEmails={mergeEmails}
            onOpen={onOpen}
            onUnfile={onUnfile}
          />
        )}
        {(!done || !filed) && <p className="p-3 text-sm text-muted">Loading…</p>}
      </div>
    </div>
  );
}

// Everything under the label from the mail itself, newest first, with search.
function AllMail({
  labelId,
  hideLabelId,
  pinned,
  doneStatus,
  emails,
  statusOf,
  mergeEmails,
  onOpen,
  onUnfile,
}: {
  labelId: string;
  hideLabelId?: string;
  pinned: BoardEmail[]; // filed by hand and not in the mail list: shown first
  doneStatus: Map<string, string>; // finished status names, by status id
  emails: Record<string, BoardEmail>;
  statusOf: (threadId: string) => string | undefined;
  mergeEmails: (list: BoardEmail[]) => void;
  onOpen: (threadId: string) => void;
  onUnfile: (threadId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<BoardEmail[] | null>(null);
  const [next, setNext] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState("");

  const load = useCallback(
    async (q: string, pageToken?: string) => {
      setBusy(true);
      setError("");
      const res = await fetchLabelEmails(labelId, { includeOlder: true, query: q, pageToken });
      setBusy(false);
      if (res.error) return setError(res.error);
      setSearched(q);
      // Threads added to a card show up as that card, under Done or on the board.
      const own = res.emails.filter((e) => !e.partOf);
      mergeEmails(own);
      setItems((prev) => (pageToken ? [...(prev ?? []), ...own.filter((e) => !prev?.some((p) => p.threadId === e.threadId))] : own));
      setNext(res.nextPageToken);
    },
    [labelId, mergeEmails],
  );

  useEffect(() => {
    void load("");
  }, [load]);

  return (
    <div>
      <form
        className="flex gap-2 p-2 pb-0"
        onSubmit={(e) => {
          e.preventDefault();
          void load(query.trim());
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search (sender, subject, words)…"
          className="field min-w-0 flex-1 rounded-xl px-2.5 py-1 text-sm"
        />
        <button disabled={busy} className="btn-press rounded-xl bg-oat px-3 text-sm font-semibold text-bark disabled:opacity-50">
          {busy ? "…" : "Search"}
        </button>
      </form>
      {error && <p className="p-3 text-sm text-red-600">{error}</p>}
      <List loading={!items && !error} empty={searched ? "Nothing found." : "Nothing filed here yet."}>
        {[...pinned.filter((e) => !searched || matchesText(e, searched)), ...(items ?? []).filter((e) => !pinned.some((p) => p.threadId === e.threadId))].map(
          (item, i) => {
            const e = emails[item.threadId] ?? item; // live state, so edits in the open card show here
            return (
              <Row
                key={e.threadId}
                i={i}
                card={e}
                hideLabelId={hideLabelId}
                tag={statusOf(e.threadId) ?? (e.done ? (e.doneLaneId && doneStatus.get(e.doneLaneId)) || "Done" : undefined)}
                plain={isPlainEmail(e)}
                when={e.date}
                onOpen={onOpen}
                action={e.hidden ? { label: "Back to triage", run: () => onUnfile(e.threadId) } : undefined}
              />
            );
          },
        )}
      </List>
      {next && (
        <div className="p-2">
          <button
            disabled={busy}
            onClick={() => void load(query.trim(), next)}
            className="btn-press w-full rounded-xl bg-oat p-2 text-sm font-semibold text-bark disabled:opacity-50"
          >
            {busy ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

function List({ loading, empty, children }: { loading: boolean; empty: string; children: React.ReactNode[] }) {
  if (loading) return <p className="p-3 text-sm text-muted">Loading…</p>;
  if (children.length === 0) return <p className="p-3 text-sm text-muted">{empty}</p>;
  return <ul className="space-y-1.5 p-2">{children}</ul>;
}

function Row({
  i,
  card,
  hideLabelId,
  tag,
  plain,
  when,
  onOpen,
  action,
}: {
  i: number; // position, for a short stagger as the list comes in
  card: BoardEmail;
  hideLabelId?: string;
  tag?: string;
  plain?: boolean; // just an email, nothing added
  when: string;
  onOpen: (threadId: string) => void;
  action?: { label: string; run: () => void };
}) {
  const { labelNames, colorOf } = useMail();
  const here = hideLabelId ? labelNames.get(hideLabelId) : undefined;
  const labels = useMemo(() => {
    const named = cardLabelIds(card)
      .map((id) => ({ id, name: labelNames.get(id) }))
      .filter((l): l is { id: string; name: string } => !!l.name && l.name !== here && !(here && here.startsWith(`${l.name}/`)));
    return named.filter((l) => !named.some((o) => o.name.startsWith(`${l.name}/`))).slice(0, 2);
  }, [card, labelNames, here]);

  return (
    <li className="list-row group animate-rise flex items-center gap-3 px-3 py-2" style={{ animationDelay: `${Math.min(i, 15) * 25}ms` }}>
      <button onClick={() => onOpen(card.threadId)} className="min-w-0 flex-1 text-left">
        <span className="flex items-baseline gap-1.5">
          {plain && (
            <span className="shrink-0 text-xs text-muted" title="Just an email: no tasks, notes or summary on it">
              ✉
            </span>
          )}
          <span className="truncate text-sm font-semibold text-walnut group-hover:text-terracotta">{card.title}</span>
        </span>
        <span className="block truncate text-xs text-muted">
          {card.local && card.threads.length <= 1 ? "✎ Ticket" : senderName(card.from)}
          {card.threads.length > 1 && ` · ✉ ${card.threads.length}`}
          {card.summary.trim() && ` · ${card.summary.trim()}`}
        </span>
      </button>
      <span className="hidden shrink-0 gap-1 sm:flex">
        {labels.map((l) => (
          <span key={l.id} className="rounded-full border border-line bg-paper px-2 py-0.5 text-[11px] font-semibold text-bark">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: colorOf(l.id) }} />
            {l.name.split("/").join(" › ")}
          </span>
        ))}
      </span>
      {tag && <span className="shrink-0 rounded-full bg-info-bg px-2 py-0.5 text-[11px] font-semibold text-info-ink">{tag}</span>}
      {action && (
        <button
          onClick={action.run}
          className="shrink-0 text-xs font-semibold text-muted opacity-0 group-hover:opacity-100 hover:text-terracotta focus:opacity-100 max-md:opacity-100"
        >
          {action.label}
        </button>
      )}
      <span className="w-14 shrink-0 text-right text-xs text-muted">{shortDate(when)}</span>
    </li>
  );
}

// Just an email: nothing added to it in the app (no tasks, notes, links, summary,
// own title, status or extra threads).
function isPlainEmail(e: BoardEmail) {
  return (
    !e.local &&
    !e.done &&
    e.threads.length <= 1 &&
    e.tasks.length === 0 &&
    e.notes.length === 0 &&
    e.links.length === 0 &&
    !e.summary.trim() &&
    e.title === e.subject
  );
}

function matchesText(e: BoardEmail, q: string) {
  const needle = q.toLowerCase();
  return [e.title, e.subject, e.from, e.summary, e.snippet].join(" ").toLowerCase().includes(needle);
}
