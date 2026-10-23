"use client";

import { useMemo } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { MailLabel, MailView, ThreadSummary } from "@/lib/mail";
import type { FiledInfo } from "@/lib/types";
import { senderName, shortDate } from "@/lib/format";

type Props = {
  threads: ThreadSummary[];
  hiddenCount: number;
  filed: Record<string, FiledInfo>;
  view: MailView;
  title: string;
  labels: MailLabel[];
  onViewChange: (v: MailView) => void;
  hideFiled: boolean;
  onHideFiledChange: (hide: boolean) => void;
  searching: boolean;
  query: string;
  state: "idle" | "loading" | "error";
  error: string;
  hasMore: boolean;
  selectedThreadId?: string;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
  onLoadMore: () => void;
  onOpen: (thread: ThreadSummary) => void;
};

export function Inbox(p: Props) {
  const labelNames = useMemo(() => new Map(p.labels.map((l) => [l.id, l.name])), [p.labels]);

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="space-y-2 border-b border-slate-200 p-3">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900" title={p.title}>
            {p.title}
          </h2>
          {(p.view === "primary" || p.view === "inbox") && (
            <div className="flex shrink-0 rounded-md border border-slate-300 text-xs">
              {(["primary", "inbox"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => p.onViewChange(v)}
                  className={`px-2 py-0.5 ${p.view === v ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  {v === "primary" ? "Primary" : "All tabs"}
                </button>
              ))}
            </div>
          )}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            p.onSearch();
          }}
        >
          <input
            value={p.query}
            onChange={(e) => p.onQueryChange(e.target.value)}
            placeholder="Search all mail (Gmail syntax)"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
          />
          <button className="rounded-md border border-slate-300 px-2 text-sm text-slate-600 hover:bg-slate-50" title="Search / refresh">
            ↻
          </button>
        </form>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={p.hideFiled}
            onChange={(e) => p.onHideFiledChange(e.target.checked)}
            className="accent-indigo-600"
          />
          Hide emails already filed
          {p.hideFiled && p.hiddenCount > 0 && !p.searching && <span className="text-slate-400">({p.hiddenCount} hidden)</span>}
        </label>
      </div>
      <p className="border-b border-slate-100 px-3 py-1.5 text-xs text-slate-500">
        {p.searching ? "Search results · all mail" : "Drag an email onto a lane to open a ticket"}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {p.state === "error" && <p className="p-3 text-sm text-red-600">{p.error}</p>}
        {p.threads.map((t) => (
          <EmailRow
            key={t.threadId}
            thread={t}
            labelNames={labelNames}
            filed={p.filed[t.threadId]}
            selected={t.threadId === p.selectedThreadId}
            onOpen={() => p.onOpen(t)}
          />
        ))}
        {p.state === "loading" && <p className="p-3 text-sm text-slate-500">Loading…</p>}
        {p.state === "idle" && p.threads.length === 0 && (
          <p className="p-3 text-sm text-slate-500">{p.hiddenCount > 0 ? "All caught up. Everything here is filed." : "No emails found."}</p>
        )}
        {p.state === "idle" && p.hasMore && (
          <button onClick={p.onLoadMore} className="w-full p-3 text-sm text-indigo-600 hover:bg-slate-50">
            Load more
          </button>
        )}
      </div>
    </aside>
  );
}

function EmailRow({
  thread,
  labelNames,
  filed,
  selected,
  onOpen,
}: {
  thread: ThreadSummary;
  labelNames: Map<string, string>;
  filed?: FiledInfo;
  selected: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `email:${thread.threadId}` });
  // Show only the most specific labels: "Clients/Acme" already implies "Clients".
  const names = thread.labelIds.map((id) => labelNames.get(id)).filter((n): n is string => !!n);
  const userLabels = names
    .filter((n) => !names.some((other) => other.startsWith(`${n}/`)))
    .map((n) => n.split("/").join(" › "));
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={`cursor-grab border-b border-slate-100 px-3 py-2.5 hover:bg-slate-50 ${selected ? "bg-indigo-50" : ""} ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <EmailRowBody thread={thread} />
      {userLabels.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {userLabels.slice(0, 3).map((n) => (
            <span key={n} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
              {n}
            </span>
          ))}
          {userLabels.length > 3 && <span className="text-[11px] text-slate-400">+{userLabels.length - 3}</span>}
        </div>
      )}
      {filed && (
        <div
          className={`mt-1 truncate text-xs ${filed.hasNewReply ? "font-medium text-indigo-700" : "text-emerald-700"}`}
          title={`${filed.projectName} › ${filed.laneName} › ${filed.cardTitle}`}
        >
          {filed.hasNewReply ? "↩ New reply · " : "✓ "}
          {filed.projectName} › {filed.laneName}
        </div>
      )}
    </div>
  );
}

function EmailRowBody({ thread }: { thread: ThreadSummary }) {
  return (
    <>
      <div className="flex items-baseline gap-2">
        <span className={`min-w-0 flex-1 truncate text-sm ${thread.unread ? "font-semibold text-slate-900" : "text-slate-700"}`}>
          {senderName(thread.from)}
          {thread.messageCount > 1 && <span className="ml-1 text-xs font-normal text-slate-400">{thread.messageCount}</span>}
        </span>
        <span className="shrink-0 text-xs text-slate-400">{shortDate(thread.date)}</span>
      </div>
      <div className={`truncate text-sm ${thread.unread ? "font-medium text-slate-800" : "text-slate-600"}`}>{thread.subject}</div>
      <div className="truncate text-xs text-slate-400">{thread.snippet}</div>
    </>
  );
}

export function EmailRowPreview({ thread }: { thread: ThreadSummary }) {
  return (
    <div className="w-72 cursor-grabbing rounded-lg border border-indigo-300 bg-white px-3 py-2.5 shadow-xl">
      <EmailRowBody thread={thread} />
    </div>
  );
}
