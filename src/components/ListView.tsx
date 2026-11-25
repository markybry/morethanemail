"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchFiled, fetchLabelEmails } from "@/app/actions";
import type { BoardEmail, FiledCard } from "@/lib/types";
import { cardLabelIds, hasOwnLabel, latestThread } from "@/lib/cards";
import { senderName, shortDate } from "@/lib/format";
import { useMail } from "./MailContext";
import { NewCardForm } from "./NewCard";
import { Loading } from "./Loading";
import { ThreadView } from "./ThreadView";
import { cached, isFresh, remember } from "@/lib/clientCache";

// The List's lists, kept like the board's (see clientCache).
const FILED_KEY = "filed";
const ALL_FRESH_MS = 3 * 60_000;
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
  trayIds,
  triage,
  onAllowSender,
  onIgnoreSender,
  tagOf,
  cutoff,
  onClearQueue,
  onShowOlder,
  statusOf,
  mergeEmails,
  onOpen,
  onUnfile,
  onNew,
  onAddToBoard,
  onFileWaiting,
  onTrashWaiting,
  firstLaneName,
}: {
  labelId: string;
  isInbox: boolean;
  labelName: string;
  emails: Record<string, BoardEmail>;
  inLens: (e: BoardEmail | undefined) => boolean;
  inLensIds: (labelIds: string[]) => boolean; // for the waiting section
  inboxIds: string[]; // Gmail's inbox / this label's mail still to triage
  trayIds: string[]; // the Inbox's Updates/Promotions/Social/Forums mail, folded away
  triage: Triage; // what each row still to triage can do
  onAllowSender: (threadId: string) => Promise<void>; // that sender skips the tray from now on
  onIgnoreSender: (threadId: string) => Promise<void>; // that sender leaves the Inbox column
  tagOf: (threadId: string) => string | undefined;
  cutoff: { from: string | null; applies: boolean };
  onClearQueue: () => Promise<void>;
  onShowOlder: (v: boolean) => void;
  statusOf: (threadId: string) => string | undefined;
  mergeEmails: (list: BoardEmail[]) => void;
  onOpen: (threadId: string) => void;
  onUnfile: (threadId: string) => void;
  onNew: (title: string) => Promise<BoardEmail>; // a new card kept as information, filed in the List
  onAddToBoard: (threadId: string) => Promise<void>; // into the board's first status
  onFileWaiting: (threadId: string) => Promise<boolean>; // true once filed
  onTrashWaiting: (threadId: string) => Promise<boolean>; // true once trashed
  firstLaneName: string; // name of the first status on the board
}) {
  // Done and filed cards: last time's show straight away, the fresh ones replace them.
  const filedHit = cached<{ done: FiledCard[]; filed: FiledCard[] }>(FILED_KEY);
  const [done, setDone] = useState<FiledCard[] | null>(filedHit?.done ?? null);
  const [filed, setFiled] = useState<FiledCard[] | null>(filedHit?.filed ?? null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let live = true;
    if (filedHit) mergeEmails([...filedHit.done, ...filedHit.filed].map((f) => f.card).filter((c) => !emails[c.threadId]));
    void fetchFiled().then((res) => {
      if (!live) return;
      if (res.error) setError(res.error);
      else remember(FILED_KEY, { done: res.done, filed: res.filed }, true);
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
          <WaitingForReplies
            className="animate-rise"
            keep={(w) => inLensIds(w.labelIds)}
            onOpen={onOpen}
            onAddToBoard={onAddToBoard}
            onFile={onFileWaiting}
            onTrash={onTrashWaiting}
            firstLaneName={firstLaneName}
          />
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
                    actions={triageActions(triage, e, tagOf(id))}
                  />
                );
              })}
            </ul>
          )}
          {trayIds.length > 0 && (
            <Tray ids={trayIds} emails={emails} onOpen={onOpen} triage={triage} onAllowSender={onAllowSender} onIgnoreSender={onIgnoreSender} />
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

// What a row still to triage can do, without opening it first.
export type Triage = {
  firstLaneName: string | null; // the board's first status, if it has one
  addToBoard: (threadId: string) => void;
  file: (threadId: string) => void; // asks for a label first when it has none
  trash: (threadId: string) => void; // to Gmail's Trash, with undo
};
// Rows already in a status, Done or filed (tagged) only get Delete.
function triageActions(t: Triage, e: BoardEmail, tag: string | undefined) {
  const out: { label: string; run: () => void }[] = [];
  if (!tag && t.firstLaneName) out.push({ label: `+ ${t.firstLaneName}`, run: () => t.addToBoard(e.threadId) });
  if (!tag && !e.hidden) out.push({ label: "File", run: () => t.file(e.threadId) });
  if (!e.local) out.push({ label: "Delete", run: () => t.trash(e.threadId) });
  return out;
}

// Gmail's Updates, Promotions, Social and Forums mail, folded under the Inbox so
// it doesn't bury real mail but can still be skimmed. Open state is remembered.
const TRAY_KEY = "mte.trayOpen";
function Tray({
  ids,
  emails,
  onOpen,
  triage,
  onAllowSender,
  onIgnoreSender,
}: {
  ids: string[];
  emails: Record<string, BoardEmail>;
  onOpen: (threadId: string) => void;
  triage: Triage;
  onAllowSender: (threadId: string) => Promise<void>;
  onIgnoreSender: (threadId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(localStorage.getItem(TRAY_KEY) === "1");
    } catch {}
  }, []);
  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem(TRAY_KEY, v ? "0" : "1");
      } catch {}
      return !v;
    });
  };
  const unread = ids.filter((id) => emails[id]?.unread).length;
  return (
    <div className="mt-2 rounded-xl border border-dashed border-line-strong bg-oat/40">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
        title="Mail Gmail sorted into Updates, Promotions, Social or Forums"
      >
        <span className="text-xs text-muted">{open ? "▾" : "▸"}</span>
        <span className="font-semibold text-bark">Updates &amp; promotions</span>
        <span className="text-xs text-muted">
          {ids.length}
          {unread > 0 && ` · ${unread} unread`}
        </span>
      </button>
      {open && (
        <>
          <p className="px-3 pb-1 text-xs text-muted">
            &ldquo;Always show&rdquo; moves a sender up with your main mail; &ldquo;Ignore&rdquo; drops them from the Inbox. Both are undone in Settings.
          </p>
          <ul className="space-y-1.5 p-2 pt-1">
            {ids.map((id, i) => {
              const e = emails[id];
              if (!e) return null;
              return (
                <Row
                  key={id}
                  i={i}
                  card={e}
                  plain={isPlainEmail(e)}
                  when={e.date}
                  onOpen={onOpen}
                  actions={[
                    ...triageActions(triage, e, undefined),
                    { label: "Always show sender", run: () => void onAllowSender(id) },
                    { label: "Ignore sender", run: () => void onIgnoreSender(id) },
                  ]}
                />
              );
            })}
          </ul>
        </>
      )}
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

  // The unsearched list is kept like the board's lists: shown straight away
  // next time, and Gmail isn't asked again if it was fetched moments ago.
  // Searches and "Load more" always ask Gmail.
  const allKey = `all:${labelId}`;
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
      if (!q && !pageToken) remember(allKey, { items: own, next: res.nextPageToken }, true);
    },
    [labelId, mergeEmails, allKey],
  );

  useEffect(() => {
    const hit = cached<{ items: BoardEmail[]; next?: string }>(allKey);
    if (hit) {
      mergeEmails(hit.items.filter((e) => !emails[e.threadId]));
      setItems(hit.items);
      setNext(hit.next);
      setSearched("");
      if (isFresh(allKey, ALL_FRESH_MS)) return;
    }
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per label
  }, [load, allKey]);

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
  actions = action ? [action] : [],
}: {
  i: number; // position, for a short stagger as the list comes in
  card: BoardEmail;
  hideLabelId?: string;
  tag?: string;
  plain?: boolean; // just an email, nothing added
  when: string;
  onOpen: (threadId: string) => void;
  action?: { label: string; run: () => void };
  actions?: { label: string; run: () => void }[];
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
  // Read it here: the whole email opens under the row (fetched only then).
  const readId = "threadId" in latest ? latest.threadId : card.threadId;
  const canRead = !readId.startsWith("local:");
  const [reading, setReading] = useState(false);
  return (
    <li
      className="list-row group animate-rise cursor-pointer px-3 py-2.5"
      style={{ animationDelay: `${Math.min(i, 15) * 25}ms` }}
      onClick={() => onOpen(card.threadId)}
    >
      <div className="flex flex-col gap-1.5 md:flex-row md:gap-4">
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
        {(tag || labels.length > 0 || actions.length > 0) && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {tag && <span className="rounded-full bg-info-bg px-2 py-0.5 text-[0.6875rem] font-semibold text-info-ink">{tag}</span>}
            {labels.map((l) => (
              <span key={l.id} className="rounded-full border border-line bg-paper px-2 py-0.5 text-[0.6875rem] font-semibold text-bark">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: colorOf(l.id) }} />
                {l.name.split("/").join(" › ")}
              </span>
            ))}
            {actions.map((a, k) => (
              <button
                key={a.label}
                onClick={(e) => {
                  e.stopPropagation();
                  a.run();
                }}
                className={`${k === 0 ? "ml-auto" : "ml-2"} text-xs font-semibold text-muted opacity-0 group-hover:opacity-100 hover:text-terracotta focus:opacity-100 max-md:opacity-100`}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Right: the first lines of the email (or the card's summary). Clicking them opens the email here. */}
      <div
        className="min-w-0 flex-1 md:border-l md:border-line md:pl-4"
        onClick={(e) => {
          if (!canRead) return;
          e.stopPropagation();
          setReading((v) => !v);
        }}
      >
        {card.summary.trim() && <p className="line-clamp-2 text-xs font-semibold text-bark">{card.summary.trim()}</p>}
        {!reading && <p className="line-clamp-3 text-sm leading-relaxed text-muted">{preview || "No preview."}</p>}
        {canRead && (
          <button
            aria-expanded={reading}
            className="mt-1 text-xs font-semibold text-terracotta hover:underline"
            title={reading ? "Close the email" : "Read the whole email here"}
          >
            {reading ? "▴ Close" : "▾ Read here"}
          </button>
        )}
      </div>
      </div>
      {reading && (
        // Reading and clicking inside the email shouldn't open the side panel.
        <div className="mt-2 cursor-auto border-t border-line pt-2" onClick={(e) => e.stopPropagation()}>
          <ThreadView threadId={readId} />
          <div className="mt-2 flex gap-3">
            <button onClick={() => onOpen(card.threadId)} className="text-xs font-semibold text-terracotta hover:underline">
              Open card (reply, tasks, labels)
            </button>
            <button onClick={() => setReading(false)} className="text-xs font-semibold text-muted hover:text-terracotta">
              ▴ Close
            </button>
          </div>
        </div>
      )}
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
