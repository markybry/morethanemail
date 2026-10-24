"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { THEME_IDS, THEMES, type ThemeId } from "@/lib/themes";
import { MailNav } from "./LabelTree";
import { ResizeHandle, useStoredWidth, widthVar } from "./Resizable";
import { ThemeIcon, useTheme } from "./ThemeContext";

type Props = {
  user: { name: string; email: string; isDemo: boolean };
  mobileOpen: boolean;
  onClose: () => void;
};

// On desktop the sidebar sits beside the board; on phones it slides in over it.
export function Sidebar({ user, mobileOpen, onClose }: Props) {
  const pathname = usePathname();
  const w = useStoredWidth("mte.w.sidebar", 224, 160, 480);
  const { theme, setTheme } = useTheme();

  return (
    <>
      {mobileOpen && <div className="animate-fade-in fixed inset-0 z-40 bg-shadow/40 md:hidden" onClick={onClose} />}
      <nav
        className={`felt flex shrink-0 flex-col text-side-text transition-transform duration-300 max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-[82vw] max-md:max-w-xs max-md:shadow-2xl md:relative md:w-[var(--w)] ${
          mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"
        }`}
        style={widthVar(w.width)}
      >
        <ResizeHandle width={w.width} onResize={w.setWidth} onDone={w.save} onReset={w.reset} label="Resize sidebar" />
        <div className="flex items-center gap-2 px-4 py-4">
          <ThemeIcon icon={theme.icons.logo} size={26} className="animate-pop text-2xl hover:animate-wiggle" />
          <span className="font-display text-lg font-semibold tracking-tight text-side-strong">More Than Email</span>
          <button onClick={onClose} className="ml-auto rounded-full px-2 text-xl text-side-muted md:hidden" aria-label="Close menu">
            ×
          </button>
        </div>

        <Link
          href="/tasks"
          className={`mx-2 flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold transition hover:bg-white/10 ${
            pathname === "/tasks" ? "bg-side-strong/15 text-side-strong shadow-[inset_0_1px_3px_rgb(0_0_0/0.3)]" : ""
          }`}
        >
          <ThemeIcon icon={theme.icons.tasks} size={16} /> My tasks
        </Link>

        <p className="mt-5 px-5 pb-1 text-xs font-bold tracking-widest text-side-muted uppercase">Labels</p>
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <MailNav />
        </div>

        <div className="space-y-2 border-t border-dashed border-side-strong/20 px-4 py-3 text-xs">
          <label className="flex items-center gap-2">
            <span className="text-side-muted">Theme</span>
            <select
              value={theme.id}
              onChange={(e) => setTheme(e.target.value as ThemeId)}
              className="min-w-0 flex-1 rounded-lg border border-side-strong/20 bg-black/20 px-2 py-1 text-xs text-side-strong outline-none"
            >
              {THEME_IDS.map((id) => (
                <option key={id} value={id} className="text-black">
                  {THEMES[id].name}
                </option>
              ))}
            </select>
          </label>
          <div>
            <div className="truncate font-semibold text-side-strong">{user.name}</div>
            <div className="truncate text-side-muted">{user.isDemo ? "Demo mode · sample emails" : user.email}</div>
            <form action="/api/auth/logout" method="post">
              <button className="mt-2 text-side-muted transition hover:text-side-accent">Sign out</button>
            </form>
          </div>
        </div>
      </nav>
    </>
  );
}
