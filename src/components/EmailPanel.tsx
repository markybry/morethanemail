"use client";

import { useState } from "react";
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
  setEmailLabels,
  updateTask,
  updateTicket,
} from "@/app/actions";
import type { BoardEmail, LaneDTO, TaskDTO, ThreadSnapshot } from "@/lib/types";
import { dueLabel, fromDateInput, gmailLink, isOverdue, senderName, toDateInput } from "@/lib/format";
import { Drawer, DrawerHeader } from "./Drawer";
import { ThreadView } from "./ThreadView";
import { ConfirmButton, InlineEdit, Section } from "./ui";
import { useMail } from "./MailContext";

export const UNSORTED = "__unsorted";

type Props = {
  email: BoardEmail;
  workspaceLabelId: string;
  onLabelsChange: (labelIds: string[]) => void;
  lanes: LaneDTO[];
  laneId: string; // UNSORTED when not in a lane
  onPlace: (laneId: string) => void;
  onChange: (email: BoardEmail) => void;
  onSeen: () => void;
  onDelete: () => Promise<void>; // only for tickets with no email
  onClose: () => void;
};

const snapshot = (e: BoardEmail): ThreadSnapshot => ({
  threadId: e.threadId,
  subject: e.subject,
  from: e.from,
  snippet: e.snippet,
  date: e.date,
});

// One email: where it sits in this workspace, its tasks and notes, and the thread itself.
export function EmailPanel({ email, workspaceLabelId, onLabelsChange, lanes, laneId, onPlace, onChange, onSeen, onDelete, onClose }: Props) {
  return (
    <Drawer onClose={onClose}>
      <DrawerHeader onClose={onClose}>
        {email.local ? (
          <InlineEdit
            value={email.subject}
            onSave={async (subject) => {
              onChange({ ...email, subject });
              await updateTicket(email.threadId, { subject });
            }}
            className="w-full text-xl font-semibold text-walnut"
          />
        ) : (
          <h2 className="text-xl font-semibold text-walnut">{email.subject}</h2>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          {email.local ? (
            <>
              <span>Ticket · no email</span>
              <ConfirmButton label="Delete ticket" confirmLabel="Delete for good?" onConfirm={onDelete} small />
            </>
          ) : (
            <>
              <span>{senderName(email.from)}</span>
              <a href={gmailLink(email.threadId)} target="_blank" rel="noreferrer" className="hover:text-terracotta">
                Open in Gmail ↗
              </a>
            </>
          )}
          <select
            value={laneId}
            onChange={(e) => onPlace(e.target.value)}
            className="field ml-auto rounded-xl px-2 py-1 text-bark"
            aria-label="Lane"
          >
            <option value={UNSORTED}>Unsorted</option>
            {lanes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </DrawerHeader>

      {email.local ? (
        <Description email={email} onChange={onChange} />
      ) : (
        <Workspaces email={email} here={workspaceLabelId} onLabelsChange={onLabelsChange} />
      )}
      <Tasks email={email} onChange={onChange} />
      <Links email={email} onChange={onChange} />
      <Notes email={email} onChange={onChange} />
      {!email.local && (
        <Section title="Thread">
          <ThreadView threadId={email.threadId} onLoaded={onSeen} />
        </Section>
      )}
    </Drawer>
  );
}

// A ticket with no email keeps its own description (stored as the snippet the card shows).
function Description({ email, onChange }: { email: BoardEmail; onChange: (e: BoardEmail) => void }) {
  const [draft, setDraft] = useState(email.snippet);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const dirty = draft !== email.snippet;
  return (
    <Section title="Description">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={4}
        placeholder="Details, links, anything to remember…"
        className="field w-full rounded-xl px-2.5 py-1.5 text-sm"
      />
      <div className="mt-1 flex items-center gap-2">
        <button
          disabled={!dirty || state === "saving"}
          onClick={async () => {
            setState("saving");
            try {
              await updateTicket(email.threadId, { snippet: draft });
              onChange({ ...email, snippet: draft });
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
    </Section>
  );
}

// The email's workspaces are its Gmail labels: add or remove one here and it's
// applied in Gmail. Inbox counts too; removing it archives the email.
function Workspaces({
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
  // "Make this its own workspace": a new label nested under this workspace's label.
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
    <Section title="Workspaces">
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
        {current.length === 0 && <span className="text-sm text-muted">Not in any workspace.</span>}
      </div>
      <div className="relative mt-2">
        <input
          value={query}
          disabled={busy}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add to workspace… (type to search or create a label)"
          className="w-full field rounded-xl px-2.5 py-1.5 text-sm"
        />
        {q && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-line bg-white py-1 shadow-lg">
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
          title="Create a new Gmail label for this email and open it as its own workspace"
        >
          ⇪ Make this its own workspace
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
