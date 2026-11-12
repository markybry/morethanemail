"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addLink,
  addNote,
  addTask,
  createLabelForEmail,
  deleteLink,
  deleteNote,
  deleteTask,
  searchMail,
  setEmailLabels,
  updateCard,
  updateTask,
  updateTicket,
} from "@/app/actions";
import type { BoardEmail, LaneDTO, TaskDTO, ThreadSnapshot } from "@/lib/types";
import { dueLabel, fromDateInput, gmailLink, isLocalThread, isOverdue, senderName, shortDate, toDateInput } from "@/lib/format";
import { cardLabelIds, latestThread, senderAddress } from "@/lib/cards";
import { Drawer, DrawerHeader } from "./Drawer";
import { ThreadView } from "./ThreadView";
import { ConfirmButton, InlineEdit, Section } from "./ui";
import { useMail } from "./MailContext";

export const UNSORTED = "__unsorted";

// Another card this one could be added to, with what's needed to rank it.
export type CardChoice = { threadId: string; title: string; status: string; labelIds: string[]; senders: string[] };

type Props = {
  email: BoardEmail;
  workspaceLabelId: string;
  onLabelsChange: (labelIds: string[]) => void;
  lanes: LaneDTO[];
  laneId: string; // UNSORTED when not in a lane
  onPlace: (laneId: string) => void;
  onChange: (email: BoardEmail) => void;
  onSeenThread: (threadId: string) => void;
  cardChoices: CardChoice[];
  onAddToCard: (cardThreadId: string) => Promise<string | undefined>; // returns an error, if any
  onAddThread: (thread: ThreadSnapshot) => Promise<string | undefined>;
  onRemoveThread: (threadId: string) => Promise<string | undefined>;
  onDelete: () => Promise<void>; // only for tickets with no email
  onClose: () => void;
};

const snapshot = (e: BoardEmail): ThreadSnapshot => ({
  threadId: e.threadId,
  subject: e.subject,
  from: e.from,
  snippet: e.snippet,
  date: e.date,
  labelIds: e.labelIds,
});

// One card: its title and summary, status, labels, tasks, notes and links, and
// every email thread on it.
export function EmailPanel(p: Props) {
  const { email, onChange, onClose } = p;
  const latest = latestThread(email);
  const emailCount = email.threads.filter((t) => !isLocalThread(t.threadId)).length;
  return (
    <Drawer onClose={onClose}>
      <DrawerHeader onClose={onClose}>
        <InlineEdit
          value={email.title}
          onSave={async (title) => {
            if (email.local) {
              onChange({ ...email, subject: title, title });
              await updateTicket(email.threadId, { subject: title });
            } else {
              onChange({ ...email, title: title.trim() || email.subject });
              await updateCard(email.threadId, { title });
            }
          }}
          className="w-full text-xl font-semibold text-walnut"
        />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          {email.local && emailCount === 0 ? (
            <>
              <span>Ticket · no email</span>
              <ConfirmButton label="Delete ticket" confirmLabel="Delete for good?" onConfirm={p.onDelete} small />
            </>
          ) : (
            <>
              <span>{senderName(latest.from)}</span>
              {emailCount > 1 && <span>· {emailCount} emails</span>}
              {emailCount === 1 && !email.local && (
                <a href={gmailLink(email.threadId)} target="_blank" rel="noreferrer" className="hover:text-terracotta">
                  Open in Gmail ↗
                </a>
              )}
            </>
          )}
          <select
            value={p.laneId}
            onChange={(e) => p.onPlace(e.target.value)}
            className="field ml-auto rounded-xl px-2 py-1 text-bark"
            aria-label="Status"
          >
            <option value={UNSORTED}>Not in a status</option>
            {p.lanes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </DrawerHeader>

      {email.local ? (
        <TextBlock
          title="Description"
          value={email.snippet}
          placeholder="Details, links, anything to remember…"
          onSave={async (snippet) => {
            await updateTicket(email.threadId, { snippet });
            onChange({ ...email, snippet });
          }}
        />
      ) : (
        <TextBlock
          title="Summary"
          value={email.summary}
          placeholder="Where things stand and what was decided…"
          onSave={async (summary) => {
            await updateCard(email.threadId, { summary });
            onChange({ ...email, summary });
          }}
        />
      )}
      {!email.local && <AddToCard email={email} choices={p.cardChoices} onAdd={p.onAddToCard} />}
      {!email.local && <Labels email={email} here={p.workspaceLabelId} onLabelsChange={p.onLabelsChange} />}
      <Tasks email={email} onChange={onChange} />
      <Links email={email} onChange={onChange} />
      <Notes email={email} onChange={onChange} />
      <Emails email={email} onSeenThread={p.onSeenThread} onAddThread={p.onAddThread} onRemoveThread={p.onRemoveThread} />
    </Drawer>
  );
}

// A block of text kept on the card: a ticket's description, or a card's summary.
function TextBlock({ title, value, placeholder, onSave }: { title: string; value: string; placeholder: string; onSave: (v: string) => Promise<void> }) {
  const [draft, setDraft] = useState(value);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const dirty = draft !== value;
  return (
    <Section title={title}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={draft ? 4 : 2}
        placeholder={placeholder}
        className="field w-full rounded-xl px-2.5 py-1.5 text-sm"
      />
      {(dirty || state === "error") && (
        <div className="mt-1 flex items-center gap-2">
          <button
            disabled={!dirty || state === "saving"}
            onClick={async () => {
              setState("saving");
              try {
                await onSave(draft);
                setState("idle");
              } catch {
                setState("error");
              }
            }}
            className="btn-press rounded-xl bg-moss px-3 py-1 text-sm font-bold text-cream disabled:opacity-50"
          >
            {state === "saving" ? "Saving…" : "Save"}
          </button>
          {state === "error" && <span className="text-sm text-red-600">Couldn&apos;t save. Try again.</span>}
        </div>
      )}
    </Section>
  );
}

// Put this card's email(s) inside another card. Cards sharing a label or a
// sender with this one are listed first.
function AddToCard({ email, choices, onAdd }: { email: BoardEmail; choices: CardChoice[]; onAdd: (cardThreadId: string) => Promise<string | undefined> }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ranked = useMemo(() => {
    const mine = new Set(cardLabelIds(email).filter((id) => id.startsWith("Label_")));
    const senders = new Set(email.threads.map((t) => senderAddress(t.from)));
    const q = query.trim().toLowerCase();
    return choices
      .filter((c) => c.threadId !== email.threadId)
      .filter((c) => !q || c.title.toLowerCase().includes(q))
      .map((c) => ({ c, score: c.labelIds.filter((id) => mine.has(id)).length * 2 + (c.senders.some((s) => senders.has(s)) ? 1 : 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.c);
  }, [choices, email, query]);

  if (choices.length === 0) return null;
  if (!open)
    return (
      <div className="px-5 pt-3">
        <button onClick={() => setOpen(true)} className="text-sm font-semibold text-terracotta hover:underline">
          ⊕ Add to another card…
        </button>
      </div>
    );
  return (
    <Section title="Add to a card" action={<button onClick={() => setOpen(false)} className="text-xs text-muted hover:text-bark">Cancel</button>}>
      <p className="mb-2 text-xs text-muted">This card&apos;s email, notes and tasks move into the card you pick, and it gets that card&apos;s labels.</p>
      <input
        autoFocus
        value={query}
        disabled={busy}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a card…"
        className="field w-full rounded-xl px-2.5 py-1.5 text-sm"
      />
      <div className="mt-2 space-y-1">
        {ranked.map((c) => (
          <button
            key={c.threadId}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              const err = await onAdd(c.threadId);
              setBusy(false);
              if (err) setError(err);
            }}
            className="flex w-full items-baseline gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-oat disabled:opacity-50"
          >
            <span className="min-w-0 flex-1 truncate text-walnut">{c.title}</span>
            <span className="shrink-0 text-xs text-muted">{c.status}</span>
          </button>
        ))}
        {ranked.length === 0 && <p className="text-sm text-muted">No cards match.</p>}
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </Section>
  );
}

// Every email thread on the card, newest first. The newest is open; the rest
// fold away. Older emails can be found and added from here.
function Emails({
  email,
  onSeenThread,
  onAddThread,
  onRemoveThread,
}: {
  email: BoardEmail;
  onSeenThread: (threadId: string) => void;
  onAddThread: (thread: ThreadSnapshot) => Promise<string | undefined>;
  onRemoveThread: (threadId: string) => Promise<string | undefined>;
}) {
  const threads = email.threads.filter((t) => !isLocalThread(t.threadId));
  const [open, setOpen] = useState<Set<string>>(() => new Set(threads.slice(0, 1).map((t) => t.threadId)));
  const [error, setError] = useState("");
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Section title={threads.length > 1 ? `Emails · ${threads.length}` : "Email"}>
      {threads.length === 0 && <p className="mb-2 text-sm text-muted">No emails on this card yet.</p>}
      {threads.length === 1 ? (
        <ThreadView threadId={threads[0].threadId} onLoaded={() => onSeenThread(threads[0].threadId)} />
      ) : (
        <div className="space-y-2">
          {threads.map((t) => (
            <div key={t.threadId} className="rounded-lg border border-line">
              <div className="flex items-baseline gap-2 px-3 py-2 text-sm">
                <button onClick={() => toggle(t.threadId)} className="min-w-0 flex-1 text-left" aria-expanded={open.has(t.threadId)}>
                  <span className="mr-1 text-muted">{open.has(t.threadId) ? "▾" : "▸"}</span>
                  <span className={t.newReply ? "font-bold text-walnut" : "font-semibold text-ink"}>{t.subject}</span>
                  <span className="block truncate pl-4 text-xs text-muted">
                    {senderName(t.from)} · {shortDate(t.date)}
                    {t.newReply && <span className="text-accent-ink"> · new reply</span>}
                  </span>
                </button>
                <a href={gmailLink(t.threadId)} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-muted hover:text-terracotta">
                  Gmail ↗
                </a>
                {t.threadId !== email.threadId && (
                  <ConfirmButton
                    label="Take off"
                    confirmLabel="Take off card?"
                    small
                    onConfirm={async () => {
                      const err = await onRemoveThread(t.threadId);
                      if (err) setError(err);
                    }}
                  />
                )}
              </div>
              {open.has(t.threadId) && (
                <div className="border-t border-line p-2">
                  <ThreadView threadId={t.threadId} onLoaded={() => onSeenThread(t.threadId)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      <AddEmail onCard={new Set(threads.map((t) => t.threadId))} onAdd={onAddThread} />
    </Section>
  );
}

// Search all mail for an email that belongs on this card.
function AddEmail({ onCard, onAdd }: { onCard: Set<string>; onAdd: (thread: ThreadSnapshot) => Promise<string | undefined> }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BoardEmail[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="mt-2 text-sm font-semibold text-terracotta hover:underline">
        + Add an email to this card
      </button>
    );
  return (
    <div className="mt-3 space-y-2">
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const res = await searchMail(query);
          setBusy(false);
          if (res.error) setError(res.error);
          setResults(res.emails);
        }}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all mail (sender, subject, words)…"
          className="field min-w-0 flex-1 rounded-xl px-2.5 py-1.5 text-sm"
        />
        <button disabled={busy || !query.trim()} className="btn-press rounded-xl bg-oat px-3 text-sm font-semibold text-bark disabled:opacity-50">
          {busy ? "…" : "Search"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">
          Cancel
        </button>
      </form>
      {results && (
        <div className="space-y-1">
          {results.length === 0 && <p className="text-sm text-muted">Nothing found.</p>}
          {results.map((r) => {
            const here = onCard.has(r.threadId);
            const elsewhere = !here && (!!r.partOf || r.threads.length > 1);
            return (
              <div key={r.threadId} className="flex items-baseline gap-2 rounded-lg px-2 py-1 text-sm hover:bg-oat">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-walnut">{r.subject}</span>
                  <span className="block truncate text-xs text-muted">
                    {senderName(r.from)} · {shortDate(r.date)}
                    {elsewhere && " · on another card"}
                  </span>
                </span>
                {here ? (
                  <span className="shrink-0 text-xs text-muted">On this card</span>
                ) : (
                  <button
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      const err = await onAdd(snapshot(r));
                      setBusy(false);
                      if (err) setError(err);
                      else setResults((prev) => prev?.filter((x) => x.threadId !== r.threadId) ?? null);
                    }}
                    className="btn-press shrink-0 rounded-lg bg-moss px-2 py-0.5 text-xs font-bold text-cream disabled:opacity-50"
                  >
                    Add
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// The card's Gmail labels: add or remove one here and it's
// applied in Gmail. Inbox counts too; removing it archives the email.
function Labels({
  email,
  here,
  onLabelsChange,
}: {
  email: BoardEmail;
  here: string;
  onLabelsChange: (labelIds: string[]) => void;
}) {
  const { labels, labelNames, reloadLabels } = useMail();
  const router = useRouter();
  const [query, setQuery] = useState("");
  // "New label for this card": nested under the label being looked through.
  const parent = here === "INBOX" ? "" : (labelNames.get(here) ?? "");
  const [ownName, setOwnName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const nameOf = (id: string) => (id === "INBOX" ? "Inbox" : labelNames.get(id));
  const current = email.labelIds.filter((id) => nameOf(id));
  const q = query.trim().toLowerCase();
  const options = [{ id: "INBOX", name: "Inbox" }, ...labels]
    .filter((l) => !email.labelIds.includes(l.id))
    .filter((l) => !q || l.name.toLowerCase().includes(q))
    .slice(0, 8);
  const exact = [{ name: "Inbox" }, ...labels].some((l) => l.name.toLowerCase() === q);

  async function run(fn: () => Promise<{ labelIds?: string[]; error?: string }>) {
    setBusy(true);
    setError("");
    const res = await fn();
    setBusy(false);
    if (res.error) return setError(res.error);
    if (res.labelIds) onLabelsChange(res.labelIds);
    setQuery("");
    reloadLabels();
  }

  return (
    <Section title="Labels">
      <div className="flex flex-wrap gap-1.5">
        {current.map((id) => (
          <span
            key={id}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm ${
              id === here ? "border-terracotta/50 bg-accent-soft text-accent-ink" : "border-line bg-cream text-bark"
            }`}
          >
            <Link href={`/l/${encodeURIComponent(id)}?thread=${email.threadId}`} className="hover:underline">
              {nameOf(id)!.split("/").join(" › ")}
            </Link>
            <button
              disabled={busy}
              onClick={() => run(() => setEmailLabels(email.threadId, [], [id]))}
              className="text-muted hover:text-red-600 disabled:opacity-40"
              title={id === "INBOX" ? "Archive (remove from Inbox)" : "Remove this label in Gmail"}
            >
              ✕
            </button>
          </span>
        ))}
        {current.length === 0 && <span className="text-sm text-muted">No labels.</span>}
      </div>
      <div className="relative mt-2">
        <input
          value={query}
          disabled={busy}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add a label… (type to search or create one)"
          className="w-full field rounded-xl px-2.5 py-1.5 text-sm"
        />
        {q && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-line bg-cream py-1 shadow-lg">
            {options.map((l) => (
              <button
                key={l.id}
                onClick={() => run(() => setEmailLabels(email.threadId, [l.id], []))}
                className="block w-full truncate px-3 py-1 text-left text-sm hover:bg-oat"
              >
                {l.name.split("/").join(" › ")}
              </button>
            ))}
            {!exact && (
              <button
                onClick={() => run(() => createLabelForEmail(email.threadId, query))}
                className="block w-full truncate px-3 py-1 text-left text-sm text-terracotta hover:bg-oat"
              >
                + Create label “{query.trim()}”
              </button>
            )}
          </div>
        )}
      </div>
      {ownName === null ? (
        <button
          onClick={() => setOwnName(email.subject.split("/").join("-").slice(0, 80))}
          className="mt-2 text-sm font-semibold text-terracotta hover:underline"
          title="Create a new Gmail label for this card and look at it through that label"
        >
          ⇪ New label for this card
        </button>
      ) : (
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = parent ? `${parent}/${ownName}` : ownName;
            setBusy(true);
            setError("");
            const res = await createLabelForEmail(email.threadId, name);
            setBusy(false);
            if (res.error || !res.label) return setError(res.error ?? "Couldn't create the label.");
            if (res.labelIds) onLabelsChange(res.labelIds);
            reloadLabels();
            router.push(`/l/${encodeURIComponent(res.label.id)}?thread=${email.threadId}`);
          }}
        >
          <span className="shrink-0 text-sm text-muted">{parent ? `${parent.split("/").join(" › ")} ›` : "New label:"}</span>
          <input
            autoFocus
            value={ownName}
            disabled={busy}
            onChange={(e) => setOwnName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setOwnName(null)}
            className="field min-w-0 flex-1 rounded-xl px-2 py-1 text-sm"
          />
          <button disabled={busy || !ownName.trim()} className="btn-press rounded-xl bg-moss px-3 py-1 text-sm font-bold text-cream disabled:opacity-50">
            Create
          </button>
          <button type="button" onClick={() => setOwnName(null)} className="text-sm text-muted">
            Cancel
          </button>
        </form>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </Section>
  );
}

function Tasks({ email, onChange }: { email: BoardEmail; onChange: (e: BoardEmail) => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const setTasks = (tasks: TaskDTO[]) => onChange({ ...email, tasks });

  return (
    <Section title={`Tasks ${email.tasks.length ? `· ${email.tasks.filter((t) => t.done).length}/${email.tasks.length}` : ""}`}>
      <ul className="space-y-1">
        {email.tasks.map((t) => (
          <li key={t.id} className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-oat">
            <input
              type="checkbox"
              checked={t.done}
              onChange={async () => {
                setTasks(email.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
                await updateTask(t.id, { done: !t.done });
              }}
              className="h-4 w-4 accent-moss transition active:scale-125"
            />
            <span className={`flex-1 text-sm ${t.done ? "text-muted line-through" : "text-walnut"}`}>{t.title}</span>
            <input
              type="date"
              value={toDateInput(t.dueDate)}
              onChange={async (e) => {
                const dueDate = fromDateInput(e.target.value);
                setTasks(email.tasks.map((x) => (x.id === t.id ? { ...x, dueDate } : x)));
                await updateTask(t.id, { dueDate });
              }}
              className={`rounded border-0 bg-transparent text-xs ${
                t.dueDate && !t.done && isOverdue(t.dueDate) ? "text-red-600" : "text-muted"
              } ${t.dueDate ? "" : "opacity-0 group-hover:opacity-100"}`}
              title={t.dueDate ? dueLabel(t.dueDate) : "Set due date"}
            />
            <button
              onClick={async () => {
                setTasks(email.tasks.filter((x) => x.id !== t.id));
                await deleteTask(t.id);
              }}
              className="text-faint opacity-0 group-hover:opacity-100 hover:text-red-600"
              title="Delete task"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          const task = await addTask(snapshot(email), title, fromDateInput(due));
          setTasks([...email.tasks, task]);
          setTitle("");
          setDue("");
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          className="min-w-0 flex-1 field rounded-xl px-2.5 py-1.5 text-sm"
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="field rounded-xl px-2 text-sm text-bark"
        />
        <button className="btn-press rounded-xl bg-terracotta px-3 text-sm font-bold text-cream">Add</button>
      </form>
    </Section>
  );
}

// Links kept with the ticket. Attachments stay in the email thread below.
function Links({ email, onChange }: { email: BoardEmail; onChange: (e: BoardEmail) => void }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const host = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return u;
    }
  };
  return (
    <Section title="Links">
      <ul className="space-y-1">
        {email.links.map((l) => (
          <li key={l.id} className="group flex items-center gap-2 text-sm">
            <span className="text-muted">🔗</span>
            <a href={l.url} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 truncate text-walnut hover:text-terracotta">
              {l.title || host(l.url)}
              {l.title && <span className="ml-1.5 text-xs text-muted">{host(l.url)}</span>}
            </a>
            <button
              onClick={async () => {
                onChange({ ...email, links: email.links.filter((x) => x.id !== l.id) });
                await deleteLink(l.id);
              }}
              className="text-xs text-muted opacity-0 group-hover:opacity-100 hover:text-red-600 max-md:opacity-100"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex flex-wrap gap-1.5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!url.trim()) return;
          setError("");
          const res = await addLink(snapshot(email), url, title);
          if (!res.link) return setError(res.error ?? "Couldn't save the link.");
          onChange({ ...email, links: [...email.links, res.link] });
          setUrl("");
          setTitle("");
        }}
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a link…"
          className="field min-w-0 flex-[2] rounded-xl px-2.5 py-1.5 text-sm"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          className="field min-w-0 flex-1 rounded-xl px-2.5 py-1.5 text-sm"
        />
        {url.trim() && <button className="btn-press rounded-xl bg-moss px-3 py-1 text-sm font-bold text-cream">Add</button>}
      </form>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </Section>
  );
}

function Notes({ email, onChange }: { email: BoardEmail; onChange: (e: BoardEmail) => void }) {
  const [body, setBody] = useState("");
  return (
    <Section title="Notes">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!body.trim()) return;
          const note = await addNote(snapshot(email), body);
          onChange({ ...email, notes: [note, ...email.notes] });
          setBody("");
        }}
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
          }}
          rows={2}
          placeholder="Add a note… (Ctrl+Enter to save)"
          className="w-full field rounded-xl px-2.5 py-1.5 text-sm"
        />
        {body.trim() && <button className="btn-press animate-pop mt-1 rounded-xl bg-mustard px-3 py-1 text-sm font-bold text-walnut">Save note</button>}
      </form>
      <ul className="mt-2 space-y-2">
        {email.notes.map((n) => (
          <li key={n.id} className="group animate-rise -rotate-[0.4deg] rounded-xl border border-note-line bg-note px-3 py-2 shadow-[0_2px_0_var(--color-note-edge),0_6px_12px_-6px_rgb(80_55_25/0.3)] even:rotate-[0.4deg]">
            <p className="text-sm whitespace-pre-wrap text-walnut">{n.body}</p>
            <div className="mt-1 flex text-xs text-muted">
              <span>{new Date(n.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
              <button
                onClick={async () => {
                  onChange({ ...email, notes: email.notes.filter((x) => x.id !== n.id) });
                  await deleteNote(n.id);
                }}
                className="ml-auto opacity-0 group-hover:opacity-100 hover:text-red-600"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
