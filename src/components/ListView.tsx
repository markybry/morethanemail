"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchFiled, fetchLabelEmails } from "@/app/actions";
import type { BoardEmail, FiledCard } from "@/lib/types";
import { cardLabelIds, hasOwnLabel, latestThread } from "@/lib/cards";
import { senderName, shortDate } from "@/lib/format";
import { useMail } from "./MailContext";
import { NewCardForm } from "./NewCard";
import { Loading } from "./Loading";
import { WaitingForReplies } from "./WaitingForReplies";

// Everything under the label (all labelled mail in the Workspace), older mail
// included, plus labelled cards with no email. Only labelled things are filed:
// the rest is ignored or deleted. Cards show their status; rows that are just
// an email, with nothing added, are marked so.
export function ListView({
  labelId,
  isInbox,
  labelName,
  emails,
  inLens,
  inLensIds,
  inboxIds,
  tagOf,
  cutoff,
  onClearQueue,
  onShowOlder,
  statusOf,
  mergeEmails,
  onOpen,
  onUnfile,
  onNew,
}: {
  labelId: string;
  isInbox: boolean;
  labelName: string;
  emails: Record<string, BoardEmail>;
  inLens: (e: BoardEmail | undefined) => boolean;
  inLensIds: (labelIds: string[]) => boolean; // for the waiting section
  inboxIds: string[]; // Gmail's inbox / this label's mail still to triage
  tagOf: (threadId: string) => string | undefined;
  cutoff: { from: string | null; applies: boolean };
  onClearQueue: () => Promise<void>;
  onShowOlder: (v: boolean) => void;
  statusOf: (threadId: string) => string | undefined;
  mergeEmails: (list: BoardEmail[]) => void;
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
      setDone(res.done);
      setFiled(res.filed);
    });
    return () => {
      live = false;
    };
    // Load once each time the view opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A done card's status name (Done, Resolved…), by its finished status.
  const doneStatus = useMemo(() => new Map((done ?? []).map((d) => [d.laneId!, d.status!])), [done]);
  // Labelled cards with no email: the mail list below can't include them.
  // Read from the board's state, so a card filed just now shows straight away.
  const pinned = Object.values(emails).filter((e) => e.local && (e.hidden || e.done) && hasOwnLabel(e) && inLens(e));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-muted">
          {isInbox ? "Everything under your labels" : `Everything labelled ${labelName}`}, older mail included. Only labelled things are filed. ✉
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
            if (!card.hidden) setAdding(false); // no label yet: it's asked for, then filed
          }}
          onClose={() => setAdding(false)}
        />
      )}
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <div className="paper min-h-0 flex-1 overflow-y-auto rounded-2xl border border-line">
        {/* Sent mail nobody has answered yet, first in the List. */}
        <div className="border-b border-dashed border-line-strong p-2">
          <WaitingForReplies className="animate-rise" keep={(w) => inLensIds(w.labelIds)} onOpen={onOpen} />
        </div>

        {/* What used to be the first column: the Inbox (or this label's mail) still to triage. */}
        <section id="col-inbox" className="border-b border-dashed border-line-strong p-2">
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <h2 className="text-sm font-semibold text-terracotta">{isInbox ? "Inbox" : "To triage"}</h2>
            <span className="text-xs text-muted">{inboxIds.length}</span>
            {inboxIds.length > 0 && (
              <button
                onClick={() => void onClearQueue()}
                className="btn-press ml-auto rounded-lg bg-oat px-2 py-0.5 text-xs font-semibold text-bark hover:text-terracotta"
                title="Nothing here needs you: clear it all. Only mail that arrives after now shows."
              >
                Clear queue
              </button>
            )}
          </div>
          {cutoff.from && (
            <p className="mb-1.5 px-1 text-xs text-muted">
              Queue cleared {new Date(cutoff.from).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}:{" "}
              {cutoff.applies ? "only newer mail shows." : "showing older mail too."}{" "}
              <button onClick={() => onShowOlder(cutoff.applies)} className="font-semibold text-terracotta hover:underline">
                {cutoff.applies ? "Show older" : "Only new mail"}
              </button>
            </p>
          )}
          {inboxIds.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted">Nothing to triage.</p>
          ) : (
            <ul className="space-y-1.5">
              {inboxIds.map((id, i) => {
                const e = emails[id];
                if (!e) return null;
                return (
                  <Row
                    key={id}
                    i={i}
                    card={e}
                    hideLabelId={isInbox ? undefined : labelId}
                    tag={tagOf(id)}
                    plain={isPlainEmail(e)}
                    when={e.date}
                    onOpen={onOpen}
                  />
                );
              })}
            </ul>
          )}
        </section>
        {done && filed && (
          <AllMail
            labelId={isInbox ? "ALL" : labelId}
            hideLabelId={isInbox ? undefined : labelId}
            pinned={pinned}
            doneStatus={doneStatus}
            emails={emails}
            statusOf={statusOf}
            mergeEmails={mergeEmails}
            onOpen={onOpen}
            onUnfile={onUnfile}
          />
        )}
        {(!done || !filed) && <Loading />}
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
  const [sort, setSort] = useState<Sort>("newest");
  useEffect(() => {
    try {
      const v = localStorage.getItem(SORT_KEY);
      if (v && v in SORTS) setSort(v as Sort);
    } catch {}
  }, []);
  const changeSort = (v: Sort) => {
    setSort(v);
    try {
      localStorage.setItem(SORT_KEY, v);
    } catch {}
  };

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
        <select
          value={sort}
          onChange={(e) => changeSort(e.target.value as Sort)}
          className="field rounded-xl px-2 text-sm text-bark"
          aria-label="Sort"
          title="Sort what's loaded (Load more fetches older mail)"
        >
          {Object.entries(SORTS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.name}
            </option>
          ))}
        </select>
      </form>
      {error && <p className="p-3 text-sm text-red-600">{error}</p>}
      <List loading={!items && !error} empty={searched ? "Nothing found." : "Nothing filed here yet."}>
        {[...pinned.filter((e) => !searched || matchesText(e, searched)), ...(items ?? []).filter((e) => !pinned.some((p) => p.threadId === e.threadId))]
          .map((item) => emails[item.threadId] ?? item) // live state, so edits in the open card show here
          .sort(SORTS[sort].compare)
          .map((e, i) => {
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
          })}
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
  if (loading) return <Loading />;
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

  const latest = latestThread(card);
  const preview = (card.local ? card.snippet : latest.snippet).trim();
  return (
    <li
      className="list-row group animate-rise flex cursor-pointer flex-col gap-1.5 px-3 py-2.5 md:flex-row md:gap-4"
      style={{ animationDelay: `${Math.min(i, 15) * 25}ms` }}
      onClick={() => onOpen(card.threadId)}
    >
      {/* Left: what it is. */}
      <div className="min-w-0 md:w-1/3 md:shrink-0">
        <div className="flex items-baseline gap-1.5">
          {plain && (
            <span className="shrink-0 text-xs text-muted" title="Just an email: no tasks, notes or summary on it">
              ✉
            </span>
          )}
          <button className="min-w-0 truncate text-left text-sm font-semibold text-walnut group-hover:text-terracotta">{card.title}</button>
        </div>
        <div className="mt-0.5 flex items-baseline gap-1.5 text-xs text-muted">
          <span className="min-w-0 truncate">
            {card.local && card.threads.length <= 1 ? "✎ Ticket" : senderName(latest.from)}
            {card.threads.length > 1 && ` · ✉ ${card.threads.length}`}
          </span>
          <span className="ml-auto shrink-0">{shortDate(when)}</span>
        </div>
        {(tag || labels.length > 0 || action) && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {tag && <span className="rounded-full bg-info-bg px-2 py-0.5 text-[11px] font-semibold text-info-ink">{tag}</span>}
            {labels.map((l) => (
              <span key={l.id} className="rounded-full border border-line bg-paper px-2 py-0.5 text-[11px] font-semibold text-bark">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: colorOf(l.id) }} />
                {l.name.split("/").join(" › ")}
              </span>
            ))}
            {action && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  action.run();
                }}
                className="ml-auto text-xs font-semibold text-muted opacity-0 group-hover:opacity-100 hover:text-terracotta focus:opacity-100 max-md:opacity-100"
              >
                {action.label}
              </button>
            )}
          </div>
        )}
      </div>
      {/* Right: the first lines of the email (or the card's summary). */}
      <div className="min-w-0 flex-1 md:border-l md:border-line md:pl-4">
        {card.summary.trim() && <p className="line-clamp-2 text-xs font-semibold text-bark">{card.summary.trim()}</p>}
        <p className="line-clamp-3 text-xs leading-relaxed text-muted">{preview || "No preview."}</p>
      </div>
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

// Sorting the List: what's loaded, by date, sender or subject.
const SORT_KEY = "mte.listSort";
type Sort = "newest" | "oldest" | "sender" | "subject";
const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
const SORTS: Record<Sort, { name: string; compare: (a: BoardEmail, b: BoardEmail) => number }> = {
  newest: { name: "Newest first", compare: (a, b) => b.date.localeCompare(a.date) },
  oldest: { name: "Oldest first", compare: (a, b) => a.date.localeCompare(b.date) },
  sender: { name: "Sender A–Z", compare: (a, b) => byText(senderName(latestThread(a).from), senderName(latestThread(b).from)) || b.date.localeCompare(a.date) },
  subject: { name: "Subject A–Z", compare: (a, b) => byText(a.title, b.title) || b.date.localeCompare(a.date) },
};
