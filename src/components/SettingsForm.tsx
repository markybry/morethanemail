"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { unallowSender, unignoreSender } from "@/app/actions";
import { THEME_IDS, THEMES, type ThemeId } from "@/lib/themes";
import { useMail } from "./MailContext";
import { useTheme } from "./ThemeContext";

type Props = { user: { name: string; email: string; isDemo: boolean }; ignoredSenders: string[]; allowedSenders: string[] };

export function SettingsForm({ user, ignoredSenders, allowedSenders }: Props) {
  return (
    <div className="space-y-4">
      <Appearance />
      <Allowed initial={allowedSenders} />
      <Ignored initial={ignoredSenders} />
      <Pinned />
      <Card title="Account">
        <p className="text-sm text-walnut">{user.name}</p>
        <p className="text-sm text-muted">{user.isDemo ? "Demo mode · sample emails" : user.email}</p>
        <form action="/api/auth/logout" method="post" className="mt-3">
          <button className="btn-press rounded-xl bg-oat px-3 py-1 text-sm font-semibold text-bark">Sign out</button>
        </form>
      </Card>
    </div>
  );
}

// Back to where you were (or the Inbox if Settings was opened directly). Esc too.
export function CloseSettings() {
  const router = useRouter();
  const close = () => (window.history.length > 1 ? router.back() : router.push("/l/INBOX"));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target as HTMLElement | null)?.closest?.("input, textarea, select")) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <button
      onClick={close}
      className="btn-press rounded-full bg-oat px-3 py-1 text-sm font-semibold text-bark hover:text-terracotta"
      aria-label="Close settings"
      title="Close (Esc)"
    >
      ✕ Close
    </button>
  );
}

function Card({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="paper rounded-3xl border border-line p-4">
      <h2 className="text-sm font-semibold text-terracotta">{title}</h2>
      {hint && <p className="mt-0.5 mb-3 text-xs text-muted">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Appearance() {
  const { theme, setTheme, density, setDensity, motion, setMotion, scale, setScale } = useTheme();
  const motions = [
    ["on", "On"],
    ["system", "Follow device"],
    ["off", "Off"],
  ] as const;
  const scales = [
    ["auto", "Auto"],
    ["default", "Default"],
    ["large", "Large"],
    ["xl", "Extra large"],
  ] as const;
  return (
    <Card title="Appearance">
      <div className="mb-4">
        <span className="text-sm font-semibold text-walnut">UI size</span>
        <div className="mt-1 flex w-fit overflow-hidden rounded-full border border-line-strong bg-cream text-xs font-semibold">
          {scales.map(([s, name]) => (
            <button
              key={s}
              onClick={() => setScale(s)}
              aria-pressed={scale === s}
              className={`px-3 py-1 transition ${scale === s ? "bg-moss text-cream" : "text-bark hover:bg-oat"}`}
            >
              {name}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">
          Text, buttons and icons all grow together. Auto makes everything larger on wide high-resolution screens (QHD and up). Saved on this
          device.
        </p>
      </div>
      <div className="mb-4">
        <span className="text-sm font-semibold text-walnut">Animation</span>
        <div className="mt-1 flex w-fit overflow-hidden rounded-full border border-line-strong bg-cream text-xs font-semibold">
          {motions.map(([m, name]) => (
            <button
              key={m}
              onClick={() => setMotion(m)}
              aria-pressed={motion === m}
              className={`px-3 py-1 transition ${motion === m ? "bg-moss text-cream" : "text-bark hover:bg-oat"}`}
            >
              {name}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">
          Follow device turns animation off when your computer or phone asks for less motion (on Windows, when Animation effects is off).
        </p>
      </div>
      <div className="mb-4">
        <span className="text-sm font-semibold text-walnut">Cards show</span>
        <div className="mt-1 flex w-fit overflow-hidden rounded-full border border-line-strong bg-cream text-xs font-semibold">
          {(["compact", "detailed"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDensity(d)}
              aria-pressed={density === d}
              className={`px-3 py-1 transition ${density === d ? "bg-moss text-cream" : "text-bark hover:bg-oat"}`}
            >
              {d === "compact" ? "Compact" : "Detailed"}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">
          Compact shows the title, the next action and small markers. Detailed adds the summary and latest activity. Saved on this
          device.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {THEME_IDS.map((id) => (
          <button
            key={id}
            onClick={() => setTheme(id as ThemeId)}
            className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
              theme.id === id ? "border-terracotta bg-accent-soft font-semibold text-accent-ink" : "border-line bg-cream text-bark hover:border-line-strong"
            }`}
            aria-pressed={theme.id === id}
          >
            {THEMES[id].name}
          </button>
        ))}
      </div>
    </Card>
  );
}

function Pinned() {
  const { labels, pinned, togglePin, setPins } = useMail();
  const [adding, setAdding] = useState("");
  const name = (id: string) => labels.find((l) => l.id === id)?.name.split("/").join(" › ") ?? "(label removed)";
  const move = (i: number, dir: -1 | 1) => {
    const next = [...pinned];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setPins(next);
  };
  return (
    <Card title="Pinned labels" hint="Shown at the top of the sidebar, with a count of their open cards.">
      {pinned.length === 0 && <p className="text-sm text-muted">Nothing pinned. Pin a label here, or with 📌 on it in the sidebar.</p>}
      <ul className="space-y-1">
        {pinned.map((id, i) => (
          <li key={id} className="flex items-center gap-2 rounded-xl bg-cream px-3 py-1.5 text-sm">
            <span className="min-w-0 flex-1 truncate text-walnut">{name(id)}</span>
            <button disabled={i === 0} onClick={() => move(i, -1)} className="px-1 text-muted disabled:opacity-30" title="Move up">
              ↑
            </button>
            <button disabled={i === pinned.length - 1} onClick={() => move(i, 1)} className="px-1 text-muted disabled:opacity-30" title="Move down">
              ↓
            </button>
            <button onClick={() => togglePin(id)} className="px-1 text-xs font-semibold text-muted hover:text-terracotta">
              Unpin
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <select value={adding} onChange={(e) => setAdding(e.target.value)} className="field min-w-0 flex-1 rounded-xl px-2 py-1 text-sm">
          <option value="">Pin a label…</option>
          {labels
            .filter((l) => !pinned.includes(l.id))
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name.split("/").join(" › ")}
              </option>
            ))}
        </select>
        <button
          disabled={!adding}
          onClick={() => {
            togglePin(adding);
            setAdding("");
          }}
          className="btn-press rounded-xl bg-moss px-3 text-sm font-bold text-cream disabled:opacity-50"
        >
          Pin
        </button>
      </div>
    </Card>
  );
}

// Senders whose Updates/Promotions mail shows with the main Inbox, not in the tray.
function Allowed({ initial }: { initial: string[] }) {
  const [list, setList] = useState(initial);
  const [busy, setBusy] = useState("");
  return (
    <Card title="Always-shown senders">
      <p className="mb-2 text-xs text-muted">
        Mail Gmail puts in Updates, Promotions, Social or Forums is folded into a tray under the Inbox. Mail from these
        senders shows with your main mail instead.
      </p>
      {list.length === 0 ? (
        <p className="text-sm text-muted">None yet. Choose &ldquo;Always show sender&rdquo; on an email in the tray.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((a) => (
            <li key={a} className="list-row flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-bark">{a}</span>
              <button
                disabled={busy === a}
                onClick={async () => {
                  setBusy(a);
                  setList(await unallowSender(a));
                  setBusy("");
                }}
                className="shrink-0 text-xs font-semibold text-muted hover:text-terracotta disabled:opacity-50"
              >
                Back to tray
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// Senders ignored from the Inbox column, with a way back.
function Ignored({ initial }: { initial: string[] }) {
  const [list, setList] = useState(initial);
  const [busy, setBusy] = useState("");
  return (
    <Card title="Ignored senders">
      <p className="mb-2 text-xs text-muted">
        Mail from these senders stays out of the Inbox column. Nothing changes in Gmail, and
        search still finds them.
      </p>
      {list.length === 0 ? (
        <p className="text-sm text-muted">No ignored senders.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((a) => (
            <li key={a} className="list-row flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-bark">{a}</span>
              <button
                disabled={busy === a}
                onClick={async () => {
                  setBusy(a);
                  setList(await unignoreSender(a));
                  setBusy("");
                }}
                className="shrink-0 text-xs font-semibold text-muted hover:text-terracotta disabled:opacity-50"
              >
                Stop ignoring
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
