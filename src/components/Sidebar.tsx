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
      className="relative flex shrink-0 flex-col bg-gradient-to-b from-indigo-950 via-violet-950 to-fuchsia-950 text-violet-200"
      style={{ width: w.width }}
    >
      <ResizeHandle width={w.width} onResize={w.setWidth} onDone={w.save} onReset={w.reset} label="Resize sidebar" />
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="animate-pop text-xl">💌</span>
        <span className="bg-gradient-to-r from-pink-300 via-fuchsia-300 to-sky-300 bg-clip-text text-lg font-extrabold tracking-tight text-transparent">
          More Than Email
        </span>
      </div>

      <Link
        href="/tasks"
        className={`mx-2 rounded-lg px-3 py-1.5 text-sm transition hover:bg-white/10 ${
          pathname === "/tasks" ? "bg-gradient-to-r from-fuchsia-500/40 to-violet-500/30 text-white" : ""
        }`}
      >
        ☑ My tasks
      </Link>

      <p className="mt-5 px-5 pb-1 text-xs font-semibold tracking-widest text-fuchsia-300/70 uppercase">Labels</p>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <MailNav />
      </div>

      <div className="border-t border-white/10 px-4 py-3 text-xs">
        <div className="truncate font-medium text-white">{user.name}</div>
        <div className="truncate text-violet-300/70">{user.isDemo ? "Demo mode · sample emails" : user.email}</div>
        <form action="/api/auth/logout" method="post">
          <button className="mt-2 text-violet-300 transition hover:text-pink-300">Sign out</button>
        </form>
      </div>
    </nav>
  );
}
