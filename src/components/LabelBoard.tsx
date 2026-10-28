"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
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
import { ResizeHandle, useStoredWidth, widthVar } from "./Resizable";
import { ThemeIcon, useTheme } from "./ThemeContext";

const PRIMARY_KEY = "mte.inboxPrimaryOnly";

// Each lane gets its own colour (defined per theme in globals.css) and an
// icon from the theme, cycling through these. Literal class names so Tailwind keeps them.
const LANE_THEMES = [
  { box: "bg-[var(--lane-1-bg)] ring-[var(--lane-1-ring)]", bar: "bg-[var(--lane-1-bar)]", text: "text-[var(--lane-1-text)]", count: "bg-[var(--lane-1-bar)]" },
  { box: "bg-[var(--lane-2-bg)] ring-[var(--lane-2-ring)]", bar: "bg-[var(--lane-2-bar)]", text: "text-[var(--lane-2-text)]", count: "bg-[var(--lane-2-bar)]" },
  { box: "bg-[var(--lane-3-bg)] ring-[var(--lane-3-ring)]", bar: "bg-[var(--lane-3-bar)]", text: "text-[var(--lane-3-text)]", count: "bg-[var(--lane-3-bar)]" },
  { box: "bg-[var(--lane-4-bg)] ring-[var(--lane-4-ring)]", bar: "bg-[var(--lane-4-bar)]", text: "text-[var(--lane-4-text)]", count: "bg-[var(--lane-4-bar)]" },
  { box: "bg-[var(--lane-5-bg)] ring-[var(--lane-5-ring)]", bar: "bg-[var(--lane-5-bar)]", text: "text-[var(--lane-5-text)]", count: "bg-[var(--lane-5-bar)]" },
  { box: "bg-[var(--lane-6-bg)] ring-[var(--lane-6-ring)]", bar: "bg-[var(--lane-6-bar)]", text: "text-[var(--lane-6-text)]", count: "bg-[var(--lane-6-bar)]" },
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
  const { theme: look } = useTheme();
  const isInbox = workspace.labelId === "INBOX";
  const [lanes, setLanes] = useState<LaneDTO[]>(workspace.lanes);
  const [emails, setEmails] = useState<Record<string, BoardEmail>>(initialEmails);
  const [unsorted, setUnsorted] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(initialThreadId ?? null);
  const [saveError, setSaveError] = useState("");

  // The board updates straight away; if saving then fails, put it back and say so
  // rather than leave a change on screen that will be gone on the next visit.
  const save = useCallback(async (write: () => Promise<unknown>, undo: () => void) => {
    try {
      await write();
      setSaveError("");
    } catch (e) {
      console.error("Saving the board failed", e);
      undo();
      setSaveError("Couldn't save that change, so it has been undone. Check your connection and try again.");
    }
  }, []);

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
  // Only on first load: saving a change re-renders the page with new props.
  const [refreshIds] = useState(() => [
    ...new Set([...workspace.lanes.flatMap((l) => l.threadIds), ...(initialThreadId ? [initialThreadId] : [])]),
  ]);
  useEffect(() => {
    void refreshEmails(refreshIds).then((r) => mergeEmails(r.emails));
  }, [refreshIds, mergeEmails]);

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

  const apply = (cols: Columns) => {
    setLanes(cols.lanes);
    setUnsorted(cols.unsorted);
  };

  // Save a move from one column to another (or a reorder within a lane).
  // `before` is the board as it was, restored if the save fails.
  const persist = async (threadId: string, from: string | undefined, to: string, cols: Columns, before: Columns) => {
    if (from === to && to === UNSORTED) return;
    const affected = new Set([from, to].filter((x): x is string => !!x && x !== UNSORTED));
    const email = emails[threadId];
    await save(
      () =>
        arrangeEmails(workspace.id, {
          lanes: cols.lanes.filter((l) => affected.has(l.id)).map((l) => ({ laneId: l.id, threadIds: l.threadIds })),
          unsorted: to === UNSORTED ? [threadId] : [],
          snapshots: to !== UNSORTED && email ? [snapshotOf(email)] : [],
        }),
      () => apply(before),
    );
  };

  // From the email panel's lane picker.
  const place = async (threadId: string, target: string) => {
    const cols = { lanes, unsorted };
    const from = containerOf(threadId, cols);
    if (from === target) return;
    const next = moveInto(cols, threadId, target);
    apply(next);
    await persist(threadId, from, target, next, cols);
  };

  // ----- drag and drop -----
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // On touch screens, press and hold to pick a card up; a quick swipe scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
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
    await persist(id, snap.from, target, next, snap);
  }

  // ----- lanes -----
  const [newLane, setNewLane] = useState("");
  const laneWidth = useStoredWidth("mte.w.lane", 288, 200, 640);

  async function moveLane(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= lanes.length) return;
    const before = lanes;
    const next = [...lanes];
    [next[index], next[target]] = [next[target], next[index]];
    setLanes(next);
    await save(() => reorderLanes(workspace.id, next.map((l) => l.id)), () => setLanes(before));
  }

  async function removeLane(lane: LaneDTO) {
    // Its emails go back to unsorted.
    const before = { lanes, unsorted };
    setLanes((prev) => prev.filter((l) => l.id !== lane.id));
    setUnsorted((prev) => byDate([...prev, ...lane.threadIds]));
    await save(() => deleteLane(lane.id), () => apply(before));
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
      <div className="flex h-full min-h-0 flex-col md:flex-row">
        <ColumnTabs
          columns={[
            { id: "unsorted", name: "Unsorted", count: unsorted.length },
            ...lanes.map((l) => ({ id: l.id, name: l.name, count: l.threadIds.length })),
            { id: "add", name: "+ Lane", count: null },
          ]}
        />
        {/* On phones this row scrolls sideways, one column per screen; on desktop it dissolves. */}
        <div className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] md:contents">
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
          look={look}
        />

        <section className="board-bg flex min-w-0 flex-1 gap-4 overflow-x-auto p-4 max-md:flex-none max-md:gap-3 max-md:overflow-visible max-md:p-3">
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
                const rename = (to: string) => setLanes((prev) => prev.map((l) => (l.id === lane.id ? { ...l, name: to } : l)));
                rename(name);
                await save(() => renameLane(lane.id, name), () => rename(lane.name));
              }}
              onDelete={() => removeLane(lane)}
              onOpen={setSelected}
              width={laneWidth}
              colors={LANE_THEMES[i % LANE_THEMES.length]}
              icon={look.icons.lanes[i % look.icons.lanes.length]}
            />
          ))}
          <div id="col-add" className="w-64 shrink-0 snap-start space-y-2 max-md:w-[80vw]">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newLane.trim()) return;
                await save(
                  async () => {
                    const lane = await createLane(workspace.id, newLane);
                    setLanes((prev) => [...prev, lane]);
                    setNewLane("");
                  },
                  () => {},
                );
              }}
              className="relative"
            >
              <ThemeIcon icon={look.icons.addLane} size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" />
              <input
                value={newLane}
                onChange={(e) => setNewLane(e.target.value)}
                placeholder="Add lane"
                className="w-full rounded-2xl border-2 border-dashed border-faint bg-cream/85 py-2 pr-3 pl-9 text-sm font-semibold text-bark outline-none transition placeholder:text-muted hover:border-terracotta/60 hover:bg-cream focus:border-terracotta focus:bg-cream"
              />
            </form>
            {lanes.length === 0 && (
              <p className="card-tactile animate-rise rounded-2xl px-3 py-2 text-xs leading-relaxed text-bark">
                <ThemeIcon icon={look.icons.hint} size={16} className="mr-1" />
                Add lanes to sort this label&apos;s emails, for example To do, Waiting and Done, then drag emails into them.
              </p>
            )}
          </div>
        </section>
        </div>
      </div>

      {saveError && (
        <div
          role="alert"
          className="card-tactile fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-start gap-2 rounded-2xl px-3 py-2 text-sm text-red-700"
        >
          <span className="flex-1">{saveError}</span>
          <button onClick={() => setSaveError("")} className="text-muted hover:text-bark" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

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
  look: ReturnType<typeof useTheme>["theme"];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${LANE}${UNSORTED}` });
  const w = useStoredWidth("mte.w.unsorted", 320, 220, 720);
  return (
    <aside
      id="col-unsorted"
      className="paper relative flex shrink-0 snap-start flex-col border-r border-line max-md:w-screen md:w-[var(--w)]"
      style={widthVar(w.width)}
    >
      <ResizeHandle width={w.width} onResize={w.setWidth} onDone={w.save} onReset={w.reset} label="Resize email column" />
      <div className="space-y-2 border-b border-dashed border-line-strong p-3">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate text-xl font-semibold text-walnut" title={p.title}>
            {p.title.split("/").join(" › ")}
          </h1>
          {p.isInbox && (
            <div className="flex shrink-0 overflow-hidden rounded-full border border-line-strong bg-cream text-xs font-semibold">
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
        <p className="text-xs font-semibold text-muted">
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
            <p className="text-center text-xs text-muted">
              <ThemeIcon icon={p.look.icons.loading} size={16} className="animate-bob inline-block" /> {p.look.text.loading}
            </p>
          </div>
        )}
        {p.state === "idle" && p.threadIds.length === 0 && (
          <p className="animate-rise p-4 text-center text-sm text-bark">
            <ThemeIcon
              icon={p.sortedCount > 0 ? p.look.icons.sorted : p.look.icons.empty}
              size={36}
              className="animate-bob mx-auto mb-2 block text-3xl"
            />
            {p.sortedCount > 0 ? p.look.text.sorted : p.look.text.empty}
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
      className={`touch-manipulation ${isDragging ? "opacity-30" : ""} ${selected ? "rounded-2xl ring-2 ring-terracotta ring-offset-2 ring-offset-paper" : ""}`}
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
  colors,
  icon,
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
  colors: (typeof LANE_THEMES)[number];
  icon: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${LANE}${lane.id}` });
  return (
    <div
      id={`col-${lane.id}`}
      className={`animate-rise relative flex max-h-full shrink-0 snap-start flex-col overflow-visible rounded-3xl shadow-[inset_0_2px_6px_rgb(80_55_25/0.08)] ring-1 transition max-md:w-[calc(100vw-1.5rem)] md:w-[var(--w)] ${colors.box} ${
        isOver ? "scale-[1.01] shadow-lg" : ""
      }`}
      style={widthVar(width.width)}
    >
      <div className={`mx-6 mt-0 h-1.5 rounded-b-full ${colors.bar}`} />
      <ResizeHandle width={width.width} onResize={width.setWidth} onDone={width.save} onReset={width.reset} label="Resize lanes" />
      <div className="group flex items-center gap-1 px-3 pt-2.5 pb-1">
        <ThemeIcon icon={icon} size={20} className="cursor-default text-lg hover:animate-wiggle" />
        <InlineEdit value={lane.name} onSave={onRename} className={`font-display text-base font-semibold ${colors.text}`} />
        <span key={lane.threadIds.length} className={`animate-pop rounded-full px-2 text-[11px] font-bold text-cream ${colors.count}`}>
          {lane.threadIds.length}
        </span>
        <div className="ml-auto flex items-center opacity-0 transition group-hover:opacity-100 max-md:opacity-100">
          <button disabled={isFirst} onClick={() => onMove(-1)} className="px-1 text-muted disabled:opacity-30" title="Move left">
            ‹
          </button>
          <button disabled={isLast} onClick={() => onMove(1)} className="px-1 text-muted disabled:opacity-30" title="Move right">
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
      className={`touch-manipulation ${isDragging ? "opacity-30" : ""}`}
    >
      <CardFace email={email} hideLabelId={labelId} />
    </div>
  );
}

// Phones show one column at a time; these tabs jump between them.
function ColumnTabs({ columns }: { columns: { id: string; name: string; count: number | null }[] }) {
  return (
    <nav className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-line bg-cream px-2 py-1.5 [scrollbar-width:none] md:hidden" aria-label="Columns">
      {columns.map((c) => (
        <button
          key={c.id}
          onClick={() => document.getElementById(`col-${c.id}`)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })}
          className="btn-press shrink-0 rounded-full bg-oat px-3 py-0.5 text-sm font-semibold whitespace-nowrap text-bark"
        >
          {c.name}
          {c.count !== null && <span className="ml-1 text-muted">{c.count}</span>}
        </button>
      ))}
    </nav>
  );
}
