"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createProject } from "@/app/actions";
import type { ProjectListItem } from "@/lib/types";
import { MailNav } from "./LabelTree";

type Props = { projects: ProjectListItem[]; user: { name: string; email: string; isDemo: boolean } };

export function Sidebar({ projects, user }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [name, setName] = useState("");

  return (
    <nav className="flex w-56 shrink-0 flex-col bg-slate-900 text-slate-300">
      <div className="px-4 py-4 text-base font-bold text-white">More Than Email</div>

      <Link
        href="/tasks"
        className={`mx-2 rounded-md px-3 py-1.5 text-sm hover:bg-slate-800 ${pathname === "/tasks" ? "bg-slate-800 text-white" : ""}`}
      >
        ☑ My tasks
      </Link>

      <div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto pb-4">
        <MailNav />
        <div>
        <p className="px-5 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Workspaces</p>
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/p/${p.id}`}
            className={`mx-2 flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-slate-800 ${
              pathname === `/p/${p.id}` ? "bg-slate-800 text-white" : ""
            }`}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="truncate">{p.name}</span>
          </Link>
        ))}
        <form
          className="mx-2 mt-1"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const id = await createProject(name);
            setName("");
            router.push(`/p/${id}`);
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="+ New workspace"
            className="w-full rounded-md bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-slate-500 focus:bg-slate-800"
          />
        </form>
        </div>
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
