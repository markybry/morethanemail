"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MailNav } from "./LabelTree";
import { ResizeHandle, useStoredWidth } from "./Resizable";

type Props = { user: { name: string; email: string; isDemo: boolean } };

export function Sidebar({ user }: Props) {
  const pathname = usePathname();
  const w = useStoredWidth("mte.w.sidebar", 224, 160, 480);

  return (
    <nav
      className="felt relative flex shrink-0 flex-col text-[#e9dcc7]"
      style={{ width: w.width }}
    >
      <ResizeHandle width={w.width} onResize={w.setWidth} onDone={w.save} onReset={w.reset} label="Resize sidebar" />
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="animate-pop text-2xl hover:animate-wiggle">🦊</span>
        <span className="font-display text-lg font-semibold tracking-tight text-[#f6e9d2]">More Than Email</span>
      </div>

      <Link
        href="/tasks"
        className={`mx-2 rounded-xl px-3 py-1.5 text-sm font-semibold transition hover:bg-white/10 ${
          pathname === "/tasks" ? "bg-[#f6e9d2]/15 text-[#fff6e6] shadow-[inset_0_1px_3px_rgb(0_0_0/0.3)]" : ""
        }`}
      >
        🐝 My tasks
      </Link>

      <p className="mt-5 px-5 pb-1 text-xs font-bold tracking-widest text-[#c9b08a] uppercase">Labels</p>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <MailNav />
      </div>

      <div className="border-t border-dashed border-[#f6e9d2]/20 px-4 py-3 text-xs">
        <div className="truncate font-semibold text-[#f6e9d2]">{user.name}</div>
        <div className="truncate text-[#c9b08a]">{user.isDemo ? "Demo mode · sample emails" : user.email}</div>
        <form action="/api/auth/logout" method="post">
          <button className="mt-2 text-[#c9b08a] transition hover:text-[#f2b38a]">Sign out</button>
        </form>
      </div>
    </nav>
  );
}
