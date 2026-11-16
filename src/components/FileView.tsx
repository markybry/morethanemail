"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchFiled, fetchLabelEmails } from "@/app/actions";
import type { BoardEmail, FiledCard } from "@/lib/types";
import { cardLabelIds } from "@/lib/cards";
import { senderName, shortDate } from "@/lib/format";
import { useMail } from "./MailContext";
import { NewCardForm } from "./NewCard";

type Tab = "done" | "filed";

// Where things go when they need no more work. Done: cards that reached a
// finished status. Filed: everything under the label (all labelled mail in the
// Workspace), older mail included, plus cards and emails filed by hand. Rows
// that are just an email, with nothing added, are marked so. Nothing here is lost.
export function FileView({
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
  onNew: (title: string) => Promise<BoardEmail>; // a new card kept as information, in Filed
}) {
  const [tab, setTab] = useState<Tab>("done");
  const [query, setQuery] = useState("");
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

  const q = query.trim().toLowerCase();
  const matches = useCallback(
    (e: BoardEmail) =>
      !q || [e.title, e.subject, e.from, e.summary, ...e.threads.map((t) => `${t.subject} ${t.from}`)].join(" ").toLowerCase().includes(q),
    [q],
  );
  // Read cards from the board's state so changes made in the open card show here.
  const view = (list: FiledCard[] | null, keep: (e: BoardEmail) => boolean) =>
    (list ?? []).map((f) => ({ ...f, card: emails[f.card.threadId] ?? f.card })).filter((f) => inLens(f.card) && keep(f.card) && matches(f.card));
  const shownDone = view(done, () => true);
  // Filed items the mail list below won't include: cards with no email, and filed
  // emails without the label (or, in the Workspace, without any label).
  const covered = (e: BoardEmail) =>
    !e.local && (isInbox ? cardLabelIds(e).some((id) => id.startsWith("Label_")) : inLens(e));
  const pinned = view(filed, (e) => e.hidden && !covered(e));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="File" className="inline-flex rounded-full bg-oat p-0.5">
          <TabButton on={tab === "done"} onClick={() => setTab("done")} count={done ? shownDone.length : null}>
            Done
          </TabButton>
          <TabButton on={tab === "filed"} onClick={() => setTab("filed")} count={null}>
            Filed
          </TabButton>
        </div>
        <button
          onClick={() => {
            setAdding(true);
            setTab("filed");
          }}
          className="btn-press order-last rounded-xl bg-moss px-3 py-1 text-sm font-bold text-cream md:order-none"
          title="A new card kept as information: notes, links, reference"
        >
          + New
        </button>
        {tab === "done" && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find in Done…"
            className="field min-w-0 flex-1 rounded-xl px-2.5 py-1 text-sm md:max-w-xs"
          />
        )}
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
      <p className="mb-2 text-xs text-muted">
        {tab === "done" && "Cards moved to a finished status. They leave the board and are kept here; Gmail is left as it is."}
        {tab === "filed" &&
          (isInbox
            ? "Everything under your labels, older mail included, and anything filed from triage. ✉ marks a plain email with nothing added."
            : `Everything labelled ${labelName}, older mail included, and anything filed from triage. ✉ marks a plain email with nothing added.`)}
      </p>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <div className="paper min-h-0 flex-1 overflow-y-auto rounded-2xl border border-line">
        {tab === "done" && (
          <List loading={!done} empty={q ? "Nothing matches." : "Nothing done yet."}>
            {shownDone.map((f, i) => (
              <Row key={f.card.threadId} i={i} card={f.card} hideLabelId={isInbox ? undefined : labelId} tag={f.status} when={f.at} onOpen={onOpen} />
            ))}
          </List>
        )}
        {tab === "filed" && (
          <AllMail
            labelId={isInbox ? "ALL" : labelId}
            hideLabelId={isInbox ? undefined : labelId}
            pinned={pinned.map((f) => f.card)}
            emails={emails}
            statusOf={statusOf}
            mergeEmails={mergeEmails}
            onOpen={onOpen}
            onUnfile={onUnfile}
          />
        )}
      </div>
    </div>
  );
}

// Everything under the label from the mail itself, newest first, with search.
function AllMail({
  labelId,
  hideLabelId,
  pinned,
  emails,
  statusOf,
  mergeEmails,
  onOpen,
  onUnfile,
}: {
  labelId: string;
  hideLabelId?: string;
  pinned: BoardEmail[]; // filed by hand and not in the mail list: shown first
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
        className="flex gap-2 border-b border-line p-2"
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
                tag={statusOf(e.threadId) ?? (e.done ? "Done" : undefined)}
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

function TabButton({ on, onClick, count, children }: { on: boolean; onClick: () => void; count: number | null; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={`rounded-full px-3 py-0.5 text-sm font-semibold whitespace-nowrap transition ${on ? "bg-cream text-walnut shadow-sm" : "text-muted hover:text-bark"}`}
    >
      {children}
      {count !== null && <span className="ml-1 font-normal text-muted">{count}</span>}
    </button>
  );
}

function List({ loading, empty, children }: { loading: boolean; empty: string; children: React.ReactNode[] }) {
  if (loading) return <p className="p-3 text-sm text-muted">Loading…</p>;
  if (children.length === 0) return <p className="p-3 text-sm text-muted">{empty}</p>;
  return <ul className="divide-y divide-line">{children}</ul>;
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
    <li className="group animate-rise flex items-center gap-3 px-3 py-2 hover:bg-oat/60" style={{ animationDelay: `${Math.min(i, 15) * 25}ms` }}>
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
