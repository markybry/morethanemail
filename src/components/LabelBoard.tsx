"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { arrangeEmails, createLane, deleteLane, fetchLabelEmails, refreshEmails, renameLane, reorderLanes } from "@/app/actions";
import type { BoardEmail, LaneDTO, ThreadSnapshot, WorkspaceDTO } from "@/lib/types";
import { CardFace } from "./CardFace";
import { EmailPanel, UNSORTED } from "./EmailPanel";
import { useMail } from "./MailContext";
import { ConfirmButton, InlineEdit } from "./ui";
import { ResizeHandle, useStoredWidth } from "./Resizable";

const PRIMARY_KEY = "mte.inboxPrimaryOnly";

// Each lane gets its own earthy colour and a woodland animal, cycling through
// these. Literal class names so Tailwind keeps them.
const LANE_THEMES = [
  { animal: "🦔", box: "bg-[#e6ead8] ring-[#cfd8b4]", bar: "bg-[#8aa05f]", text: "text-[#4a5a2c]", count: "bg-[#7d9455]" },
  { animal: "🦊", box: "bg-[#f3e0d3] ring-[#e7c6b0]", bar: "bg-[#cf7a4b]", text: "text-[#7a3e1f]", count: "bg-[#c4693f]" },
  { animal: "🐝", box: "bg-[#f4e8c6] ring-[#e8d49a]", bar: "bg-[#d9ab3f]", text: "text-[#6e531a]", count: "bg-[#c99a2e]" },
  { animal: "🦉", box: "bg-[#e0e6ea] ring-[#c6d1d9]", bar: "bg-[#6f8b9c]", text: "text-[#34495a]", count: "bg-[#5f7a8c]" },
  { animal: "🐻", box: "bg-[#ecdcd5] ring-[#dcc0b4]", bar: "bg-[#9a6b55]", text: "text-[#5a3627]", count: "bg-[#8a5c47]" },
  { animal: "🐢", box: "bg-[#e3e5d4] ring-[#cdd0b0]", bar: "bg-[#8f9466]", text: "text-[#4b4e2c]", count: "bg-[#80855a]" },
];
const T = "t:"; // draggable email ids
const LANE = "lane:"; // droppable column ids
const fromId = (id: string) => id.slice(T.length);

type Columns = { lanes: LaneDTO[]; unsorted: string[] };

const snapshotOf = (e: BoardEmail): ThreadSnapshot => ({
  threadId: e.threadId,
  subject: e.subject,
  from: e.from,
  snippet: e.snippet,
  date: e.date,
});

// A Gmail label's workspace: the label's emails, unsorted, plus any lanes the
// user has added to sort them. Every card is an email; there are no other tickets.
export function LabelBoard({
  workspace,
  initialEmails,
  initialThreadId,
}: {
  workspace: WorkspaceDTO;
  initialEmails: Record<string, BoardEmail>;
  initialThreadId?: string;
}) {
  const { reloadLabels } = useMail();
  const isInbox = workspace.labelId === "INBOX";
  const [lanes, setLanes] = useState<LaneDTO[]>(workspace.lanes);
  const [emails, setEmails] = useState<Record<string, BoardEmail>>(initialEmails);
  const [unsorted, setUnsorted] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(initialThreadId ?? null);

  const mergeEmails = useCallback((list: BoardEmail[]) => {
    setEmails((prev) => {
      const next = { ...prev };
      for (const e of list) next[e.threadId] = e;
      return next;
    });
  }, []);

  const placed = useMemo(() => new Set(lanes.flatMap((l) => l.threadIds)), [lanes]);
  const placedRef = useRef(placed);
  useEffect(() => {
    placedRef.current = placed;
  }, [placed]);

  // ----- the label's emails from Gmail (unsorted column) -----
  const [primaryOnly, setPrimaryOnly] = useState(true);
  const [prefsReady, setPrefsReady] = useState(false);
  const [query, setQuery] = useState("");
  const [loadedQuery, setLoadedQuery] = useState("");
  const [nextPage, setNextPage] = useState<string | undefined>();
  const [listState, setListState] = useState<"loading" | "idle" | "error">("loading");
  const [listError, setListError] = useState("");

  const load = useCallback(
    async (q: string, pageToken?: string) => {
      setListState("loading");
      const res = await fetchLabelEmails(workspace.labelId, { primaryOnly, query: q, pageToken });
      if (res.error) {
        setListError(res.error);
        setListState("error");
        return;
      }
      mergeEmails(res.emails);
      const ids = res.emails.map((e) => e.threadId).filter((id) => !placedRef.current.has(id));
      setUnsorted((prev) => (pageToken ? [...prev, ...ids.filter((id) => !prev.includes(id))] : ids));
      setNextPage(res.nextPageToken);
      setLoadedQuery(q);
      setListState("idle");
    },
    [workspace.labelId, primaryOnly, mergeEmails],
  );

  useEffect(() => {
    try {
      setPrimaryOnly(localStorage.getItem(PRIMARY_KEY) !== "false");
    } catch {}
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    if (prefsReady) void load("");
  }, [prefsReady, load]);

  // Emails sorted into lanes may be far down the label; refresh them directly
  // so new replies show. Also fetch an email linked to directly (?thread=).
  useEffect(() => {
    const ids = [...new Set([...workspace.lanes.flatMap((l) => l.threadIds), ...(initialThreadId ? [initialThreadId] : [])])];
    void refreshEmails(ids).then((r) => mergeEmails(r.emails));
  }, [workspace.lanes, initialThreadId, mergeEmails]);

  const changePrimaryOnly = (v: boolean) => {
    setPrimaryOnly(v);
    try {
      localStorage.setItem(PRIMARY_KEY, String(v));
    } catch {}
  };

  // ----- moving emails between columns -----
  const byDate = useCallback(
    (ids: string[]) => [...ids].sort((a, b) => (emails[b]?.date ?? "").localeCompare(emails[a]?.date ?? "")),
    [emails],
  );

  const containerOf = (threadId: string, cols: Columns) =>
    cols.lanes.find((l) => l.threadIds.includes(threadId))?.id ?? (cols.unsorted.includes(threadId) ? UNSORTED : undefined);

  const targetOf = (overId: string, cols: Columns) =>
    overId.startsWith(LANE) ? overId.slice(LANE.length) : containerOf(fromId(overId), cols);

  const moveInto = (cols: Columns, threadId: string, target: string, before?: string): Columns => {
    const lanesOut = cols.lanes.map((l) => ({ ...l, threadIds: l.threadIds.filter((t) => t !== threadId) }));
    const unsortedOut = cols.unsorted.filter((t) => t !== threadId);
    if (target === UNSORTED) return { lanes: lanesOut, unsorted: byDate([...unsortedOut, threadId]) };
    return {
      unsorted: unsortedOut,
      lanes: lanesOut.map((l) => {
        if (l.id !== target) return l;
        const idx = before ? l.threadIds.indexOf(before) : -1;
        const threadIds = [...l.threadIds];
        threadIds.splice(idx < 0 ? threadIds.length : idx, 0, threadId);
        return { ...l, threadIds };
      }),
    };
  };

  // Save a move from one column to another (or a reorder within a lane).
  const persist = async (threadId: string, from: string | undefined, to: string, cols: Columns) => {
    if (from === to && to === UNSORTED) return;
    const affected = new Set([from, to].filter((x): x is string => !!x && x !== UNSORTED));
    const email = emails[threadId];
    await arrangeEmails(workspace.id, {
      lanes: cols.lanes.filter((l) => affected.has(l.id)).map((l) => ({ laneId: l.id, threadIds: l.threadIds })),
      unsorted: to === UNSORTED ? [threadId] : [],
      snapshots: to !== UNSORTED && email ? [snapshotOf(email)] : [],
    });
  };

  const apply = (cols: Columns) => {
    setLanes(cols.lanes);
    setUnsorted(cols.unsorted);
  };

  // From the email panel's lane picker.
  const place = async (threadId: string, target: string) => {
    const cols = { lanes, unsorted };
    const from = containerOf(threadId, cols);
    if (from === target) return;
    const next = moveInto(cols, threadId, target);
    apply(next);
    await persist(threadId, from, target, next);
  };

  // ----- drag and drop -----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const snapshot = useRef<(Columns & { from?: string }) | null>(null);

  const collision: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    const cardHits = hits.filter((h) => String(h.id).startsWith(T));
    if (cardHits.length) return cardHits;
    if (hits.length) return hits;
    return closestCorners(args);
  };

  function onDragStart({ active }: DragStartEvent) {
    const id = fromId(String(active.id));
    setActiveId(id);
    snapshot.current = { lanes, unsorted, from: containerOf(id, { lanes, unsorted }) };
  }

  // Emails follow the pointer into lanes while dragging. The unsorted column
  // keeps Gmail's date order, so it only takes an email back on drop.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const id = fromId(String(active.id));
    const cols = { lanes, unsorted };
    const target = targetOf(String(over.id), cols);
    if (!target || target === UNSORTED || target === containerOf(id, cols)) return;
    const before = String(over.id).startsWith(T) ? fromId(String(over.id)) : undefined;
    apply(moveInto(cols, id, target, before));
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    const snap = snapshot.current;
    snapshot.current = null;
    setActiveId(null);
    const id = fromId(String(active.id));
    const cols = { lanes, unsorted };
    const target = over ? targetOf(String(over.id), cols) : undefined;
    if (!snap || !target) {
      if (snap) apply(snap);
      return;
    }
    let next = cols;
    if (target === UNSORTED) next = moveInto(cols, id, UNSORTED);
    else {
      const lane = cols.lanes.find((l) => l.id === target)!;
      const overThread = String(over!.id).startsWith(T) ? fromId(String(over!.id)) : undefined;
      if (!lane.threadIds.includes(id)) next = moveInto(cols, id, target, overThread);
      else if (overThread && overThread !== id && lane.threadIds.includes(overThread)) {
        const threadIds = arrayMove(lane.threadIds, lane.threadIds.indexOf(id), lane.threadIds.indexOf(overThread));
        next = { ...cols, lanes: cols.lanes.map((l) => (l.id === target ? { ...l, threadIds } : l)) };
      }
    }
    apply(next);
    await persist(id, snap.from, target, next);
  }

  // ----- lanes -----
  const [newLane, setNewLane] = useState("");
  const laneWidth = useStoredWidth("mte.w.lane", 288, 200, 640);

  async function moveLane(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= lanes.length) return;
    const next = [...lanes];
    [next[index], next[target]] = [next[target], next[index]];
    setLanes(next);
    await reorderLanes(workspace.id, next.map((l) => l.id));
  }

  async function removeLane(lane: LaneDTO) {
    // Its emails go back to unsorted.
    setLanes((prev) => prev.filter((l) => l.id !== lane.id));
    setUnsorted((prev) => byDate([...prev, ...lane.threadIds]));
    await deleteLane(lane.id);
  }

  const selectedEmail = selected ? emails[selected] : undefined;
  const activeEmail = activeId ? emails[activeId] : undefined;

  return (
    <DndContext
      id="label-board" // stable id avoids an SSR/client hydration mismatch in dnd-kit's aria ids
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        if (snapshot.current) apply(snapshot.current);
        snapshot.current = null;
        setActiveId(null);
      }}
    >
      <div className="flex h-full min-h-0">
        <UnsortedColumn
          title={workspace.name}
          labelId={workspace.labelId}
          isInbox={isInbox}
          primaryOnly={primaryOnly}
          onPrimaryOnlyChange={changePrimaryOnly}
          threadIds={unsorted}
          emails={emails}
          sortedCount={placed.size}
          query={query}
          searching={!!loadedQuery}
          state={listState}
          error={listError}
          hasMore={!!nextPage}
          selected={selected}
          onQueryChange={setQuery}
          onSearch={() => {
            void load(query.trim());
            reloadLabels();
          }}
          onLoadMore={() => load(loadedQuery, nextPage)}
          onOpen={setSelected}
        />

        <section className="board-bg flex min-w-0 flex-1 gap-4 overflow-x-auto p-4">
          {lanes.map((lane, i) => (
            <Lane
              key={lane.id}
              lane={lane}
              emails={emails}
              labelId={workspace.labelId}
              isFirst={i === 0}
              isLast={i === lanes.length - 1}
              onMove={(dir) => moveLane(i, dir)}
              onRename={async (name) => {
                setLanes((prev) => prev.map((l) => (l.id === lane.id ? { ...l, name } : l)));
                await renameLane(lane.id, name);
              }}
              onDelete={() => removeLane(lane)}
              onOpen={setSelected}
              width={laneWidth}
              theme={LANE_THEMES[i % LANE_THEMES.length]}
            />
          ))}
          <div className="w-64 shrink-0 space-y-2">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newLane.trim()) return;
                const lane = await createLane(workspace.id, newLane);
                setLanes((prev) => [...prev, lane]);
                setNewLane("");
              }}
            >
              <input
                value={newLane}
                onChange={(e) => setNewLane(e.target.value)}
                placeholder="🌱 Add lane"
                className="w-full rounded-2xl border-2 border-dashed border-[#cdb999] bg-cream/50 px-3 py-2 text-sm font-semibold text-bark outline-none transition placeholder:text-[#9a8466] hover:border-terracotta/60 hover:bg-cream focus:border-terracotta focus:bg-cream"
              />
            </form>
            {lanes.length === 0 && (
              <p className="card-tactile animate-rise rounded-2xl px-3 py-2 text-xs leading-relaxed text-bark">
                <span className="mr-1">🐿️</span>
                Add lanes to sort this label&apos;s emails, for example To do, Waiting and Done, then drag emails into them.
              </p>
            )}
          </div>
        </section>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeEmail ? <CardFace email={activeEmail} hideLabelId={workspace.labelId} dragging /> : null}
      </DragOverlay>

      {selectedEmail && (
        <EmailPanel
          key={selectedEmail.threadId}
          email={selectedEmail}
          workspaceLabelId={workspace.labelId}
          onLabelsChange={(labelIds) => {
            mergeEmails([{ ...selectedEmail, labelIds }]);
            // Took it out of this label: it leaves this workspace's columns.
            if (!labelIds.includes(workspace.labelId)) {
              setUnsorted((prev) => prev.filter((t) => t !== selectedEmail.threadId));
              setLanes((prev) => prev.map((l) => ({ ...l, threadIds: l.threadIds.filter((t) => t !== selectedEmail.threadId) })));
            } else if (!containerOf(selectedEmail.threadId, { lanes, unsorted })) {
              // Added to this label: it joins the unsorted column.
              setUnsorted((prev) => byDate([...prev, selectedEmail.threadId]));
            }
          }}
          lanes={lanes}
          laneId={containerOf(selectedEmail.threadId, { lanes, unsorted }) ?? UNSORTED}
          onPlace={(laneId) => place(selectedEmail.threadId, laneId)}
          onChange={(e) => mergeEmails([e])}
          onSeen={() => mergeEmails([{ ...selectedEmail, newReply: false, unread: false }])}
          onClose={() => setSelected(null)}
        />
      )}
    </DndContext>
  );
}

// ---------- columns ----------

function UnsortedColumn(p: {
  title: string;
  labelId: string;
  isInbox: boolean;
  primaryOnly: boolean;
  onPrimaryOnlyChange: (v: boolean) => void;
  threadIds: string[];
  emails: Record<string, BoardEmail>;
  sortedCount: number;
  query: string;
  searching: boolean;
  state: "loading" | "idle" | "error";
  error: string;
  hasMore: boolean;
  selected: string | null;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
  onLoadMore: () => void;
  onOpen: (threadId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${LANE}${UNSORTED}` });
  const w = useStoredWidth("mte.w.unsorted", 320, 220, 720);
  return (
    <aside className="paper relative flex shrink-0 flex-col border-r border-[#e3d5bf]" style={{ width: w.width }}>
      <ResizeHandle width={w.width} onResize={w.setWidth} onDone={w.save} onReset={w.reset} label="Resize email column" />
      <div className="space-y-2 border-b border-dashed border-[#d9c9ad] p-3">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate text-xl font-semibold text-walnut" title={p.title}>
            {p.title.split("/").join(" › ")}
          </h1>
          {p.isInbox && (
            <div className="flex shrink-0 overflow-hidden rounded-full border border-[#d9c9ad] bg-cream text-xs font-semibold">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  onClick={() => p.onPrimaryOnlyChange(v)}
                  className={`px-2.5 py-0.5 transition ${
                    p.primaryOnly === v ? "bg-moss text-cream" : "text-bark hover:bg-oat"
                  }`}
                >
                  {v ? "Primary" : "All tabs"}
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
            placeholder="🔎 Search this label"
            className="field min-w-0 flex-1 rounded-xl px-2.5 py-1.5 text-sm"
          />
          <button className="btn-press rounded-xl bg-oat px-2.5 text-sm text-bark" title="Search / refresh">
            ↻
          </button>
        </form>
        <p className="text-xs font-semibold text-[#9a8466]">
          {p.searching ? "Search results" : "Unsorted"}
          {p.sortedCount > 0 && ` · ${p.sortedCount} sorted into lanes`}
        </p>
      </div>
      <div ref={setNodeRef} className={`min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5 transition-colors ${isOver ? "bg-oat/60" : ""}`}>
        {p.state === "error" && <p className="p-2 text-sm text-red-600">{p.error}</p>}
        {p.threadIds.map((id) =>
          p.emails[id] ? (
            <DraggableEmail key={id} email={p.emails[id]} labelId={p.labelId} selected={p.selected === id} onOpen={() => p.onOpen(id)} />
          ) : null,
        )}
        {p.state === "loading" && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-oat" />
            ))}
            <p className="text-center text-xs text-[#9a8466]">
              <span className="animate-bob inline-block">🐢</span> Fetching your mail…
            </p>
          </div>
        )}
        {p.state === "idle" && p.threadIds.length === 0 && (
          <p className="animate-rise p-4 text-center text-sm text-bark">
            <span className="animate-bob mb-1 block text-3xl">{p.sortedCount > 0 ? "🦉" : "🦔"}</span>
            {p.sortedCount > 0 ? "All sorted. Time for a cuppa." : "Nothing with this label yet."}
          </p>
        )}
        {p.state === "idle" && p.hasMore && (
          <button onClick={p.onLoadMore} className="btn-press w-full rounded-xl bg-oat p-2 text-sm font-semibold text-bark">
            Load more
          </button>
        )}
      </div>
    </aside>
  );
}

function DraggableEmail({ email, labelId, selected, onOpen }: { email: BoardEmail; labelId: string; selected: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${T}${email.threadId}` });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={`${isDragging ? "opacity-30" : ""} ${selected ? "rounded-2xl ring-2 ring-terracotta ring-offset-2 ring-offset-paper" : ""}`}
    >
      <CardFace email={email} hideLabelId={labelId} />
    </div>
  );
}

function Lane({
  lane,
  emails,
  labelId,
  isFirst,
  isLast,
  onMove,
  onRename,
  onDelete,
  onOpen,
  width,
  theme,
}: {
  lane: LaneDTO;
  emails: Record<string, BoardEmail>;
  labelId: string;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dir: -1 | 1) => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onOpen: (threadId: string) => void;
  width: ReturnType<typeof useStoredWidth>;
  theme: (typeof LANE_THEMES)[number];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${LANE}${lane.id}` });
  return (
    <div
      className={`animate-rise relative flex max-h-full shrink-0 flex-col overflow-visible rounded-3xl shadow-[inset_0_2px_6px_rgb(80_55_25/0.08)] ring-1 transition ${theme.box} ${
        isOver ? "scale-[1.01] shadow-lg" : ""
      }`}
      style={{ width: width.width }}
    >
      <div className={`mx-6 mt-0 h-1.5 rounded-b-full ${theme.bar}`} />
      <ResizeHandle width={width.width} onResize={width.setWidth} onDone={width.save} onReset={width.reset} label="Resize lanes" />
      <div className="group flex items-center gap-1 px-3 pt-2.5 pb-1">
        <span className="cursor-default text-lg hover:animate-wiggle" aria-hidden>
          {theme.animal}
        </span>
        <InlineEdit value={lane.name} onSave={onRename} className={`font-display text-base font-semibold ${theme.text}`} />
        <span key={lane.threadIds.length} className={`animate-pop rounded-full px-2 text-[11px] font-bold text-cream ${theme.count}`}>
          {lane.threadIds.length}
        </span>
        <div className="ml-auto flex items-center opacity-0 transition group-hover:opacity-100">
          <button disabled={isFirst} onClick={() => onMove(-1)} className="px-1 text-[#a8957a] disabled:opacity-30" title="Move left">
            ‹
          </button>
          <button disabled={isLast} onClick={() => onMove(1)} className="px-1 text-[#a8957a] disabled:opacity-30" title="Move right">
            ›
          </button>
          <ConfirmButton label="✕" confirmLabel="Delete lane?" onConfirm={onDelete} small />
        </div>
      </div>
      <div ref={setNodeRef} className={`flex min-h-24 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-2.5 ${isOver ? "rounded-2xl bg-cream/50" : ""}`}>
        <SortableContext items={lane.threadIds.map((t) => `${T}${t}`)} strategy={verticalListSortingStrategy}>
          {lane.threadIds.map((t) =>
            emails[t] ? <SortableEmail key={t} email={emails[t]} labelId={labelId} onOpen={() => onOpen(t)} /> : null,
          )}
        </SortableContext>
      </div>
    </div>
  );
}

function SortableEmail({ email, labelId, onOpen }: { email: BoardEmail; labelId: string; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `${T}${email.threadId}` });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={isDragging ? "opacity-30" : ""}
    >
      <CardFace email={email} hideLabelId={labelId} />
    </div>
  );
}
