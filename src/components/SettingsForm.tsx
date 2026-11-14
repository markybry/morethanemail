"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setTriageFrom } from "@/app/actions";
import { toDateInput } from "@/lib/format";
import { THEME_IDS, THEMES, type ThemeId } from "@/lib/themes";
import { useMail } from "./MailContext";
import { useTheme } from "./ThemeContext";

const PRIMARY_KEY = "mte.inboxPrimaryOnly"; // shared with the board

type Props = { user: { name: string; email: string; isDemo: boolean }; triageFrom: string | null };

export function SettingsForm({ user, triageFrom }: Props) {
  return (
    <div className="space-y-4">
      <Appearance />
      <Triage triageFrom={triageFrom} />
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
  const { theme, setTheme, density, setDensity } = useTheme();
  return (
    <Card title="Appearance">
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

function Triage({ triageFrom }: { triageFrom: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [primaryOnly, setPrimaryOnly] = useState(true);
  useEffect(() => {
    try {
      setPrimaryOnly(localStorage.getItem(PRIMARY_KEY) !== "false");
    } catch {}
  }, []);
  const save = async (when: "now" | string | null) => {
    setBusy(true);
    await setTriageFrom(when);
    setBusy(false);
    router.refresh();
  };
  const changePrimary = (v: boolean) => {
    setPrimaryOnly(v);
    try {
      localStorage.setItem(PRIMARY_KEY, String(v));
    } catch {}
  };
  return (
    <Card title="Triage">
      <div className="space-y-4">
        <div>
          <label className="flex flex-wrap items-center gap-2 text-sm text-bark">
            <span className="font-semibold text-walnut">Done before</span>
            <input
              type="date"
              value={triageFrom ? toDateInput(triageFrom) : ""}
              disabled={busy}
              onChange={(e) => void save(e.target.value || null)}
              className="field rounded-xl px-2 py-1 text-sm"
            />
            <button disabled={busy} onClick={() => void save("now")} className="btn-press rounded-xl bg-oat px-3 py-1 text-xs font-semibold text-bark">
              Up to now
            </button>
            {triageFrom && (
              <button disabled={busy} onClick={() => void save(null)} className="text-xs font-semibold text-muted hover:text-terracotta">
                Clear
              </button>
            )}
          </label>
          <p className="mt-1 text-xs text-muted">
            Labelled mail from before this date counts as done: it stays out of the triage column and Recent. A new message
            brings it back. Your Inbox and searches aren&apos;t affected, and nothing changes in Gmail.
          </p>
        </div>
        <div>
          <span className="text-sm font-semibold text-walnut">Inbox shows</span>
          <div className="mt-1 flex w-fit overflow-hidden rounded-full border border-line-strong bg-cream text-xs font-semibold">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                onClick={() => changePrimary(v)}
                className={`px-3 py-1 transition ${primaryOnly === v ? "bg-moss text-cream" : "text-bark hover:bg-oat"}`}
              >
                {v ? "Primary only" : "All tabs"}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">All tabs includes Updates, Promotions, Social and Forums. Saved on this device.</p>
        </div>
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
