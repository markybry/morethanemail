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
    <nav className="relative flex shrink-0 flex-col bg-slate-900 text-slate-300" style={{ width: w.width }}>
      <ResizeHandle width={w.width} onResize={w.setWidth} onDone={w.save} onReset={w.reset} label="Resize sidebar" />
      <div className="px-4 py-4 text-base font-bold text-white">More Than Email</div>

      <Link
        href="/tasks"
        className={`mx-2 rounded-md px-3 py-1.5 text-sm hover:bg-slate-800 ${pathname === "/tasks" ? "bg-slate-800 text-white" : ""}`}
      >
        ☑ My tasks
      </Link>

      <p className="mt-5 px-5 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Labels</p>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <MailNav />
      </div>

      <div className="border-t border-slate-800 px-4 py-3 text-xs">
        <div className="truncate text-slate-200">{user.name}</div>
        <div className="truncate text-slate-500">{user.isDemo ? "Demo mode · sample emails" : user.email}</div>
        <form action="/api/auth/logout" method="post">
          <button className="mt-2 text-slate-400 hover:text-white">Sign out</button>
        </form>
      </div>
    </nav>
  );
}
