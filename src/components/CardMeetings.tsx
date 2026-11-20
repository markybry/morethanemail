"use client";

import { useEffect, useMemo, useState } from "react";
import { createCardEvent, findEvents, linkEvent, refreshCardEvents, unlinkEvent } from "@/app/actions";
import type { BoardEmail, CalendarEvent, EventDTO, TaskDTO, ThreadSnapshot } from "@/lib/types";
import { senderAddress } from "@/lib/cards";
import { senderName } from "@/lib/format";
import { Section } from "./ui";
import { useMail } from "./MailContext";

// When an event is: "Thu 20 Nov, 14:00–15:00", or just the day for all-day ones.
function when(e: { start: string; end: string; allDay: boolean }) {
  const start = new Date(e.start);
  const day: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
  if (e.allDay) return start.toLocaleDateString([], { ...day, timeZone: "UTC" });
  const time = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${start.toLocaleDateString([], day)}, ${time(start)}–${time(new Date(e.end))}`;
}

// "2026-11-19" for a date input, in local time.
const dayInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function NotConnected() {
  return (
    <p className="mt-1 text-sm text-muted">
      Google Calendar isn&apos;t connected yet.{" "}
      <a href="/api/auth/google?connect=calendar" className="font-semibold text-terracotta hover:underline">
        Connect it
      </a>{" "}
      (one-off permission check — your Gmail sign-in is reused).
    </p>
  );
}

// Google Calendar events linked to the card. Linking one also puts it at the
// top of the card's tasks with its time, so it's the next action.
export function Meetings({
  email,
  snapshot,
  onChange,
}: {
  email: BoardEmail;
  snapshot: ThreadSnapshot;
  onChange: (e: BoardEmail) => void;
}) {
  const { me } = useMail();
  const [mode, setMode] = useState<"idle" | "link" | "new">("idle");
  const [error, setError] = useState("");
  const apply = (r: { events?: EventDTO[]; tasks?: TaskDTO[]; error?: string }) => {
    if (r.error) setError(r.error);
    if (r.events && r.tasks) onChange({ ...email, events: r.events, tasks: r.tasks });
    return !r.error;
  };

  // The people on the card's emails (not you), to invite or to match events by.
  const people = useMemo(() => {
    const out = new Map<string, string>();
    for (const t of [email, ...email.threads]) {
      const address = senderAddress(t.from);
      if (address && address !== me.toLowerCase() && address.includes("@")) out.set(address, senderName(t.from));
    }
    return [...out].map(([address, name]) => ({ address, name }));
  }, [email, me]);

  // Opening the card catches up with Calendar: moved meetings move their task.
  const hasEvents = email.events.length > 0;
  useEffect(() => {
    if (!hasEvents) return;
    let live = true;
    void refreshCardEvents(email.threadId).then((r) => {
      if (live && r.events && r.tasks) onChange({ ...email, events: r.events, tasks: r.tasks });
    });
    return () => {
      live = false;
    };
    // Once per card opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email.threadId, hasEvents]);

  return (
    <Section title="Meetings">
      {email.events.length > 0 && (
        <ul className="mb-2 space-y-1">
          {email.events.map((ev) => (
            <li key={ev.id} className="group flex items-center gap-2 text-sm">
              <span className="text-muted">📅</span>
              <span className={`min-w-0 flex-1 truncate ${ev.cancelled ? "text-muted line-through" : "text-walnut"}`}>
                {ev.title}
                <span className="ml-1.5 text-xs text-muted">{ev.cancelled ? "cancelled" : when(ev)}</span>
              </span>
              {ev.htmlLink && !ev.cancelled && (
                <a href={ev.htmlLink} target="_blank" rel="noreferrer noopener" className="shrink-0 text-xs text-muted hover:text-terracotta">
                  Open ↗
                </a>
              )}
              <button
                onClick={async () => apply(await unlinkEvent(ev.id))}
                className="shrink-0 text-xs text-muted opacity-0 group-hover:opacity-100 hover:text-red-600 max-md:opacity-100"
                title="Take it off this card (it stays in your calendar)"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {mode === "idle" && (
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => (setError(""), setMode("link"))} className="btn-press rounded-xl bg-oat px-3 py-1 text-sm font-semibold text-bark hover:text-terracotta">
            Link a meeting…
          </button>
          <button onClick={() => (setError(""), setMode("new"))} className="btn-press rounded-xl bg-oat px-3 py-1 text-sm font-semibold text-bark hover:text-terracotta">
            New meeting…
          </button>
        </div>
      )}
      {mode === "link" && (
        <LinkPicker
          people={people.map((p) => p.address)}
          linked={new Set(email.events.map((e) => e.eventId))}
          onPick={async (eventId) => {
            setError("");
            if (apply(await linkEvent(snapshot, eventId))) setMode("idle");
          }}
          onError={setError}
          onClose={() => setMode("idle")}
        />
      )}
      {mode === "new" && (
        <NewMeeting
          defaultTitle={email.title}
          people={people}
          onCreate={async (input) => {
            setError("");
            const ok = apply(await createCardEvent(snapshot, input));
            if (ok) setMode("idle");
            return ok;
          }}
          onClose={() => setMode("idle")}
        />
      )}
      {error === "NOT_CONNECTED" ? <NotConnected /> : error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </Section>
  );
}

// Upcoming events to pick from, those with people on this card first.
function LinkPicker(p: {
  people: string[];
  linked: Set<string>;
  onPick: (eventId: string) => Promise<void>;
  onError: (e: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { people, onError } = p;
  const search = async (q: string) => {
    setEvents(null);
    const r = await findEvents(q, people);
    if (r.error) onError(r.error);
    setEvents(r.error ? [] : r.events);
  };
  useEffect(() => {
    void search("");
    // Once, when the picker opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const known = new Set(people);
  return (
    <div className="rounded-xl border border-line p-2">
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void search(query);
        }}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your calendar…"
          className="field min-w-0 flex-1 rounded-xl px-2.5 py-1.5 text-sm"
        />
        <button type="button" onClick={p.onClose} className="text-sm text-muted">
          Cancel
        </button>
      </form>
      <ul className="mt-2 max-h-72 space-y-0.5 overflow-y-auto">
        {events === null && <li className="px-1 text-sm text-muted">Loading…</li>}
        {events?.length === 0 && <li className="px-1 text-sm text-muted">No upcoming events{query ? " match" : ""}.</li>}
        {events?.map((ev) => {
          const linked = p.linked.has(ev.eventId);
          const withPeople = ev.attendees.some((a) => known.has(a));
          return (
            <li key={ev.eventId}>
              <button
                disabled={linked || !!busy}
                onClick={async () => {
                  setBusy(ev.eventId);
                  await p.onPick(ev.eventId);
                  setBusy(null);
                }}
                className="w-full rounded-lg px-1.5 py-1 text-left text-sm hover:bg-oat disabled:opacity-50"
              >
                <span className="text-walnut">{ev.title}</span>
                <span className="ml-1.5 text-xs text-muted">
                  {when(ev)}
                  {withPeople && " · with people on this card"}
                  {linked && " · linked"}
                  {busy === ev.eventId && " · linking…"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// A new event in your calendar, linked to this card. Ticked people are invited.
function NewMeeting(p: {
  defaultTitle: string;
  people: { address: string; name: string }[];
  onCreate: (input: { title: string; start: string; end: string; timeZone: string; attendees: string[]; description: string }) => Promise<boolean>;
  onClose: () => void;
}) {
  const tomorrow = new Date(Date.now() + 86_400_000);
  const [title, setTitle] = useState(p.defaultTitle);
  const [day, setDay] = useState(dayInput(tomorrow));
  const [time, setTime] = useState("10:00");
  const [minutes, setMinutes] = useState(60);
  const [invite, setInvite] = useState<string[]>([]);
  const [others, setOthers] = useState("");
  const [busy, setBusy] = useState(false);
  const extra = others.split(/[,;\s]+/).map((a) => a.trim()).filter((a) => a.includes("@"));
  const attendees = [...new Set([...invite, ...extra])];
  return (
    <form
      className="space-y-2 rounded-xl border border-line p-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const start = new Date(`${day}T${time}`);
        if (isNaN(start.getTime())) return;
        setBusy(true);
        await p.onCreate({
          title,
          start: start.toISOString(),
          end: new Date(start.getTime() + minutes * 60_000).toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          attendees,
          description: "",
        });
        setBusy(false);
      }}
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="field w-full rounded-xl px-2.5 py-1.5 text-sm" />
      <div className="flex flex-wrap gap-1.5">
        <input type="date" required value={day} onChange={(e) => setDay(e.target.value)} className="field rounded-xl px-2 py-1 text-sm" />
        <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className="field rounded-xl px-2 py-1 text-sm" />
        <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="field rounded-xl px-2 py-1 text-sm">
          {[15, 30, 45, 60, 90, 120].map((m) => (
            <option key={m} value={m}>
              {m < 60 ? `${m} min` : `${m / 60} hour${m > 60 ? "s" : ""}`.replace("1.5 hours", "1½ hours")}
            </option>
          ))}
        </select>
      </div>
      {p.people.length > 0 && (
        <fieldset className="space-y-0.5">
          <legend className="text-xs text-muted">Invite people on this card</legend>
          {p.people.map((x) => (
            <label key={x.address} className="flex items-center gap-2 text-sm text-walnut">
              <input
                type="checkbox"
                checked={invite.includes(x.address)}
                onChange={(e) => setInvite((prev) => (e.target.checked ? [...prev, x.address] : prev.filter((a) => a !== x.address)))}
              />
              <span className="truncate">
                {x.name} <span className="text-xs text-muted">{x.address}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <input
        value={others}
        onChange={(e) => setOthers(e.target.value)}
        placeholder="Also invite (email addresses)"
        className="field w-full rounded-xl px-2.5 py-1.5 text-sm"
      />
      <div className="flex items-center gap-2">
        <button disabled={busy} className="btn-press rounded-xl bg-moss px-3 py-1 text-sm font-bold text-cream disabled:opacity-60">
          {busy ? "Creating…" : attendees.length ? `Create and invite ${attendees.length}` : "Create in my calendar"}
        </button>
        <button type="button" onClick={p.onClose} className="text-sm text-muted">
          Cancel
        </button>
      </div>
    </form>
  );
}
