"use client";

import { useDraggable } from "@dnd-kit/core";
import type { ThreadSummary } from "@/lib/mail";
import type { FiledInfo } from "@/lib/types";
import { senderName, shortDate } from "@/lib/format";

type Props = {
  threads: ThreadSummary[];
  filed: Record<string, FiledInfo>;
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
  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white">
      <form
        className="flex gap-2 border-b border-slate-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          p.onSearch();
        }}
      >
        <input
          value={p.query}
          onChange={(e) => p.onQueryChange(e.target.value)}
          placeholder="Search mail (Gmail syntax)"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
        />
        <button className="rounded-md border border-slate-300 px-2 text-sm text-slate-600 hover:bg-slate-50" title="Refresh">
          ↻
        </button>
      </form>
      <p className="border-b border-slate-100 px-3 py-1.5 text-xs text-slate-500">Drag an email onto a lane to open a case</p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {p.state === "error" && <p className="p-3 text-sm text-red-600">{p.error}</p>}
        {p.threads.map((t) => (
          <EmailRow
            key={t.threadId}
            thread={t}
            filed={p.filed[t.threadId]}
            selected={t.threadId === p.selectedThreadId}
            onOpen={() => p.onOpen(t)}
          />
        ))}
        {p.state === "loading" && <p className="p-3 text-sm text-slate-500">Loading…</p>}
        {p.state === "idle" && p.threads.length === 0 && <p className="p-3 text-sm text-slate-500">No emails found.</p>}
        {p.state === "idle" && p.hasMore && (
          <button onClick={p.onLoadMore} className="w-full p-3 text-sm text-indigo-600 hover:bg-slate-50">
            Load more
          </button>
        )}
      </div>
    </aside>
  );
}

function EmailRow({ thread, filed, selected, onOpen }: { thread: ThreadSummary; filed?: FiledInfo; selected: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `email:${thread.threadId}` });
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
      {filed && (
        <div className="mt-1 truncate text-xs text-emerald-700" title={`${filed.projectName} › ${filed.laneName} › ${filed.cardTitle}`}>
          ✓ {filed.projectName} › {filed.laneName}
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
