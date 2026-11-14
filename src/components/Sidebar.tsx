"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MailNav } from "./LabelTree";
import { ResizeHandle, useStoredWidth, widthVar } from "./Resizable";
import { ThemeIcon, useTheme } from "./ThemeContext";

type Props = {
  user: { name: string; email: string; isDemo: boolean; triageFrom: string | null };
  mobileOpen: boolean;
  onClose: () => void;
  slotRef: (el: HTMLElement | null) => void;
};

// On desktop the sidebar sits beside the board; on phones it slides in over it.
export function Sidebar({ user, mobileOpen, onClose, slotRef }: Props) {
  const pathname = usePathname();
  const w = useStoredWidth("mte.w.side", 380, 200, 720);
  const { theme } = useTheme();

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
          href="/l/INBOX"
          className={`mx-2 flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold transition hover:bg-white/10 ${
            pathname === "/l/INBOX" ? "bg-side-strong/15 text-side-strong shadow-[inset_0_1px_3px_rgb(0_0_0/0.3)]" : ""
          }`}
        >
          <span className="w-4 text-center">📥</span> Inbox
        </Link>
        <Link
          href="/dashboard"
          className={`mx-2 flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold transition hover:bg-white/10 ${
            pathname === "/dashboard" ? "bg-side-strong/15 text-side-strong shadow-[inset_0_1px_3px_rgb(0_0_0/0.3)]" : ""
          }`}
        >
          <ThemeIcon icon={theme.icons.dashboard} size={16} /> Today
        </Link>
        <Link
          href="/tasks"
          className={`mx-2 flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold transition hover:bg-white/10 ${
            pathname === "/tasks" ? "bg-side-strong/15 text-side-strong shadow-[inset_0_1px_3px_rgb(0_0_0/0.3)]" : ""
          }`}
        >
          <ThemeIcon icon={theme.icons.tasks} size={16} /> Next actions
        </Link>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto pb-4">
          <MailNav />
        </div>
        {/* The board's Inbox / To-triage column lands here on desktop (see SidebarSlot). */}
        <div ref={slotRef} className="flex min-h-0 flex-[2] flex-col border-t border-dashed border-side-strong/20 text-ink empty:hidden max-md:hidden" />

        <div className="space-y-2 border-t border-dashed border-side-strong/20 px-4 py-3 text-xs">
          <Link
            href="/settings"
            className={`-mx-2 flex items-center gap-2 rounded-xl px-2 py-1 text-sm font-semibold transition hover:bg-white/10 ${
              pathname === "/settings" ? "bg-side-strong/15 text-side-strong" : ""
            }`}
          >
            ⚙ Settings
          </Link>
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
