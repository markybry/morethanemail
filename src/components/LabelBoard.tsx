"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
import {
  addThreadToCard,
  archiveThreads,
  applyLaneTemplate,
  arrangeEmails,
  createLane,
  createTicket,
  deleteLaneTemplate,
  deleteTicket,
  deleteLane,
  fetchLabelEmails,
  refreshEmails,
  removeThreadFromCard,
  renameLane,
  setHidden,
  setTriageFrom,
  trashCard,
  untrashCard,
  reorderLanes,
  saveLaneTemplate,
  setEmailLabels,
  setLaneFinished,
  setLaneReopenOnReply,
  updateTask,
} from "@/app/actions";
import type { BoardEmail, LaneDTO, LaneTemplateDTO, ThreadSnapshot, WorkspaceDTO } from "@/lib/types";
import { GROUP_BY, GROUP_BY_NAMES, groupThreads, isGroupBy, type GroupBy } from "@/lib/grouping";
import { CardFace, CardBoardContext, type CardAge } from "./CardFace";
import { EmailPanel, UNSORTED, type CardChoice } from "./EmailPanel";
import { cardLabelIds, senderAddress } from "@/lib/cards";
import { useMail } from "./MailContext";
import { ConfirmButton, InlineEdit } from "./ui";
import { ResizeHandle, useStoredWidth, widthVar } from "./Resizable";
import { ThemeIcon, useTheme } from "./ThemeContext";
import { InSidebar } from "./SidebarSlot";

const PRIMARY_KEY = "mte.inboxPrimaryOnly";
const RECENT_KEY = "mte.firstColumnRecent";
const GROUP_KEY = "mte.unsortedGroupBy";

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
const LANE = "lane:"; // droppable column ids; "lane:<id>#<row>" for one row of a column
const fromId = (id: string) => id.slice(T.length);
const GENERAL = "__general"; // the row for cards with no sub-label
const STALE_DAYS = 7; // a card waiting this long is flagged

// A row of the board: one sub-label of the label being looked through.
type Row = { key: string; labelId: string | null; name: string; path: string };

type Columns = { lanes: LaneDTO[]; unsorted: string[] };

const snapshotOf = (e: BoardEmail): ThreadSnapshot => ({
  threadId: e.threadId,
  subject: e.subject,
  from: e.from,
  snippet: e.snippet,
  date: e.date,
  labelIds: e.labelIds,
});

// A workflow: a first column of emails not yet in a status (the Inbox, or the
// label being looked through), then the statuses. Seen through a label (a lens),
// only that label's cards show, including its sub-labels'. A card has one status.
export function LabelBoard({
  workspace,
  initialEmails,
  initialThreadId,
  templates: initialTemplates,
  triageFrom: initialTriageFrom,
}: {
  workspace: WorkspaceDTO;
  initialEmails: Record<string, BoardEmail>;
  initialThreadId?: string;
  templates: LaneTemplateDTO[];
  triageFrom: string | null;
}) {
  const { reloadLabels, labelNames, labels } = useMail();
  const { theme: look } = useTheme();
  const lens = workspace.lens;
  // The label whose Gmail emails fill the first column.
  const sourceLabelId = lens?.labelId ?? workspace.labelId;
  const isInbox = sourceLabelId === "INBOX";
  const title = lens?.name ?? workspace.name;

  // Does a card belong in this view? With a lens: it carries the label or one of its sub-labels.
  const inLens = useCallback(
    (e: BoardEmail | undefined) => {
      if (!lens) return true;
      if (!e) return false;
      const prefix = `${labelNames.get(lens.labelId) ?? lens.name}/`;
      return cardLabelIds(e).some((id) => id === lens.labelId || !!labelNames.get(id)?.startsWith(prefix));
    },
    [lens, labelNames],
  );
  // A label with sub-labels splits each status into one row per sub-label, plus
  // "General" for cards with only the label itself.
  const rows = useMemo<Row[] | null>(() => {
    if (!lens) return null;
    const base = labelNames.get(lens.labelId) ?? lens.name;
    const kids = labels
      .filter((l) => l.name.startsWith(`${base}/`) && !l.name.slice(base.length + 1).includes("/"))
      .map((l) => ({ key: l.id, labelId: l.id, name: l.name.slice(base.length + 1), path: l.name }));
    return kids.length ? [...kids, { key: GENERAL, labelId: null, name: "General", path: base }] : null;
  }, [lens, labels, labelNames]);
  const rowOf = useCallback(
    (e: BoardEmail | undefined) => {
      if (!rows || !e) return GENERAL;
      const names = cardLabelIds(e)
        .map((id) => labelNames.get(id))
        .filter((n): n is string => !!n);
      return rows.find((r) => r.labelId && names.some((n) => n === r.path || n.startsWith(`${r.path}/`)))?.key ?? GENERAL;
    },
    [rows, labelNames],
  );

  const [lanes, setLanes] = useState<LaneDTO[]>(workspace.lanes);
  const [emails, setEmails] = useState<Record<string, BoardEmail>>(initialEmails);
  const [unsorted, setUnsorted] = useState<string[]>(workspace.ticketIds);
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
  const emailsRef = useRef(emails);
  useEffect(() => {
    placedRef.current = placed;
    emailsRef.current = emails;
  }, [placed, emails]);

  // ----- the label's emails from Gmail (unsorted column) -----
  const [primaryOnly, setPrimaryOnly] = useState(true);
  // The first column shows what's left to triage, or everything recent (newest
  // first, cards already in a status included) so nothing active is out of sight.
  const [recent, setRecent] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  // Labelled mail older than this counts as done (not used for the Inbox itself).
  const [triageFrom, setTriageFromState] = useState(initialTriageFrom);
  // The setting can change from the sidebar; follow it.
  useEffect(() => setTriageFromState(initialTriageFrom), [initialTriageFrom]);
  const [showOlder, setShowOlder] = useState(false);
  const cutoffApplies = !!triageFrom && !showOlder && (!isInbox || recent);
  const [prefsReady, setPrefsReady] = useState(false);
  const [query, setQuery] = useState("");
  const [loadedQuery, setLoadedQuery] = useState("");
  const [nextPage, setNextPage] = useState<string | undefined>();
  const [listState, setListState] = useState<"loading" | "idle" | "error">("loading");
  const [listError, setListError] = useState("");

  const load = useCallback(
    async (q: string, pageToken?: string) => {
      setListState("loading");
      const res = await fetchLabelEmails(recent && isInbox ? "ALL" : sourceLabelId, {
        primaryOnly: primaryOnly && !recent,
        query: q,
        pageToken,
        includeOlder: showOlder,
      });
      if (res.error) {
        setListError(res.error);
        setListState("error");
        return;
      }
      mergeEmails(res.emails);
      // Recent lists cards: an email added to a card shows as that card.
      const cardIds = [...new Set(res.emails.map((e) => e.partOf ?? e.threadId))];
      setRecentIds((prev) => (pageToken ? [...prev, ...cardIds.filter((id) => !prev.includes(id))] : cardIds));
      const missing = cardIds.filter((id) => !emailsRef.current[id] && !res.emails.some((e) => e.threadId === id));
      if (missing.length) void refreshEmails(missing).then((r) => mergeEmails(r.emails));
      // Cards already in a status, and emails added to a card, aren't unsorted.
      const ids = res.emails
        .filter((e) => !placedRef.current.has(e.threadId) && !(e.homeId && e.homeId !== workspace.id) && !e.partOf)
        .map((e) => e.threadId);
      // Tickets with no email aren't in Gmail's list; keep the unsorted ones (matching a search).
      const needle = q.toLowerCase();
      const tickets = Object.values(emailsRef.current)
        .filter((e) => e.local && !placedRef.current.has(e.threadId))
        .filter((e) => !needle || `${e.subject} ${e.snippet}`.toLowerCase().includes(needle))
        .map((e) => e.threadId);
      setUnsorted((prev) => (pageToken ? [...prev, ...ids.filter((id) => !prev.includes(id))] : [...tickets, ...ids]));
      setNextPage(res.nextPageToken);
      setLoadedQuery(q);
      setListState("idle");
    },
    // triageFrom: the server applies it, so a new cut-off must reload the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceLabelId, isInbox, recent, workspace.id, primaryOnly, showOlder, triageFrom, mergeEmails],
  );

  useEffect(() => {
    try {
      setPrimaryOnly(localStorage.getItem(PRIMARY_KEY) !== "false");
      setRecent(localStorage.getItem(RECENT_KEY) === "true");
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

  const changeRecent = (v: boolean) => {
    setRecent(v);
    try {
      localStorage.setItem(RECENT_KEY, String(v));
    } catch {}
  };

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
    overId.startsWith(LANE) ? overId.slice(LANE.length).split("#")[0] : containerOf(fromId(overId), cols);

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

  const reopened = useRef(new Set<string>());

  // Save a move from one column to another (or a reorder within a lane).
  // `before` is the board as it was, restored if the save fails.
  const persist = async (threadId: string, from: string | undefined, to: string, cols: Columns, before: Columns) => {
    if (from === to && to === UNSORTED) return;
    reopened.current.add(threadId);
    // Taken back out of the workflow: it shows in the first column again, Recent included.
    if (to === UNSORTED) setRecentIds((prev) => (prev.includes(threadId) ? prev : [threadId, ...prev]));
    if (from !== to && to !== UNSORTED) {
      const now = new Date().toISOString();
      setLanes((prev) => prev.map((l) => (l.id === to ? { ...l, since: { ...l.since, [threadId]: now } } : l)));
      // A finished status archives the card in Gmail (done on the server); show it here too.
      if (lanes.find((l) => l.id === to)?.finished)
        setEmails((prev) => {
          const e = prev[threadId];
          if (!e) return prev;
          const out = (ids: string[]) => ids.filter((x) => x !== "INBOX");
          return { ...prev, [threadId]: { ...e, labelIds: out(e.labelIds), threads: e.threads.map((t) => ({ ...t, labelIds: out(t.labelIds) })) } };
        });
    }
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

  // A new reply on an email in a "reopen on reply" lane (Done, Waiting...)
  // sends it back to unsorted to be triaged again. Each email is tried once per
  // visit so a failing save can't loop, and emails the user places themselves
  // stay where they're put.
  useEffect(() => {
    if (activeId) return;
    const back = lanes
      .filter((l) => l.reopenOnReply)
      .flatMap((l) => l.threadIds)
      .filter((t) => emails[t]?.newReply && !reopened.current.has(t));
    if (!back.length) return;
    back.forEach((t) => reopened.current.add(t));
    const before = { lanes, unsorted };
    const next = {
      lanes: lanes.map((l) => ({ ...l, threadIds: l.threadIds.filter((t) => !back.includes(t)) })),
      unsorted: byDate([...unsorted.filter((t) => !back.includes(t)), ...back]),
    };
    const changed = next.lanes.filter((l, i) => l.threadIds.length !== lanes[i].threadIds.length);
    apply(next);
    void save(
      () =>
        arrangeEmails(workspace.id, {
          lanes: changed.map((l) => ({ laneId: l.id, threadIds: l.threadIds })),
          unsorted: back,
          snapshots: [],
        }),
      () => apply(before),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when emails or lanes change
  }, [emails, lanes, activeId]);

  // What this view shows: only cards in the lens. Moves still work on the full lanes.
  const shownLanes = useMemo(
    () => lanes.map((l) => ({ ...l, threadIds: l.threadIds.filter((t) => inLens(emails[t])) })),
    [lanes, emails, inLens],
  );
  const inFirstColumn = useMemo(() => unsorted.filter((t) => inLens(emails[t])), [unsorted, emails, inLens]);
  // Recent picks up labelled mail that isn't tracked in a status yet (cards in
  // a status are already on the board), newest first.
  const inRecent = useMemo(
    () => recentIds.filter((t) => emails[t] && inLens(emails[t]) && !placed.has(t) && !emails[t].homeId),
    [recentIds, emails, inLens, placed],
  );
  // Hidden emails ("doesn't need tracking") fold into a list at the bottom of the column.
  const shownUnsorted = useMemo(() => inFirstColumn.filter((t) => !emails[t]?.hidden), [inFirstColumn, emails]);
  const shownRecent = useMemo(() => inRecent.filter((t) => !emails[t]?.hidden), [inRecent, emails]);
  const hiddenIds = useMemo(
    () => (recent ? inRecent : inFirstColumn).filter((t) => emails[t]?.hidden),
    [recent, inRecent, inFirstColumn, emails],
  );
  const statusOf = (threadId: string) => lanes.find((l) => l.threadIds.includes(threadId))?.name;
  const shownPlaced = shownLanes.reduce((n, l) => n + l.threadIds.length, 0);
  // Rows with the most cards first, so empty sub-labels sink to the bottom.
  const orderedRows = useMemo(() => {
    if (!rows) return null;
    const count = new Map(rows.map((r) => [r.key, 0]));
    for (const t of shownLanes.flatMap((l) => l.threadIds)) {
      const k = rowOf(emails[t]);
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    return [...rows].sort((a, b) => (count.get(b.key) ?? 0) - (count.get(a.key) ?? 0));
  }, [rows, shownLanes, rowOf, emails]);
  const newReplies = shownLanes.flatMap((l) => l.threadIds).filter((t) => emails[t]?.newReply).length;


  const collision: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    const cardHits = hits.filter((h) => String(h.id).startsWith(T));
    if (cardHits.length) return cardHits;
    const rowHits = hits.filter((h) => String(h.id).includes("#"));
    if (rowHits.length) return rowHits;
    if (hits.length) return hits;
    return closestCorners(args);
  };

  // Moving a card to another row swaps its sub-label in Gmail, on every thread.
  async function moveToRow(threadId: string, rowKey: string) {
    const e = emails[threadId];
    const to = rows?.find((r) => r.key === rowKey);
    const from = rows?.find((r) => r.key === rowOf(e));
    if (!e || !to || !from || !lens || to === from) return;
    const inside = (id: string, path: string) => {
      const n = labelNames.get(id);
      return !!n && (n === path || n.startsWith(`${path}/`));
    };
    const add = to.labelId ?? lens.labelId;
    const updated = new Map<string, string[]>();
    for (const t of e.threads) {
      const remove = from.labelId ? t.labelIds.filter((id) => inside(id, from.path)) : [];
      const res = await setEmailLabels(t.threadId, [add], remove);
      if (res.error || !res.labelIds) {
        setSaveError(res.error ?? "Couldn't change the label.");
        break;
      }
      updated.set(t.threadId, res.labelIds);
    }
    setEmails((prev) => {
      const cur = prev[threadId];
      if (!cur) return prev;
      return {
        ...prev,
        [threadId]: {
          ...cur,
          labelIds: updated.get(cur.threadId) ?? cur.labelIds,
          threads: cur.threads.map((t) => ({ ...t, labelIds: updated.get(t.threadId) ?? t.labelIds })),
        },
      };
    });
  }

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
    // Which row it was dropped in: the row itself, or the row of the card it landed on.
    const overId = String(over!.id);
    const row = rows && target !== UNSORTED ? (overId.startsWith(LANE) ? overId.split("#")[1] : rowOf(emails[fromId(overId)])) : undefined;
    await persist(id, snap.from, target, next, snap);
    if (row && row !== rowOf(emails[id])) await moveToRow(id, row);
  }

  // ----- lanes -----
  const [newLane, setNewLane] = useState("");
  const [templates, setTemplates] = useState(initialTemplates);
  const laneWidth = useStoredWidth("mte.w.lane", 360, 200, 720);

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

  // ----- cards holding several emails -----
  // Cards in a status, for "Add to another card".
  const cardChoices = useMemo<CardChoice[]>(
    () =>
      lanes.flatMap((l) =>
        l.threadIds
          .map((t) => emails[t])
          .filter((e): e is BoardEmail => !!e)
          .map((e) => ({
            threadId: e.threadId,
            title: e.title,
            status: l.name,
            labelIds: cardLabelIds(e),
            senders: e.threads.map((t) => senderAddress(t.from)),
          })),
      ),
    [lanes, emails],
  );

  // An email (or card) went into `card`: it leaves the columns. If the card had
  // no status, it takes the email's.
  const absorb = (card: BoardEmail, childId: string) => {
    const childLane = lanes.find((l) => l.threadIds.includes(childId));
    const cardPlaced = lanes.some((l) => l.threadIds.includes(card.threadId));
    mergeEmails([card]);
    setLanes((prev) =>
      prev.map((l) => ({
        ...l,
        threadIds:
          childLane && !cardPlaced ? l.threadIds.map((x) => (x === childId ? card.threadId : x)) : l.threadIds.filter((x) => x !== childId),
      })),
    );
    setUnsorted((prev) => prev.filter((x) => x !== childId && !(childLane && !cardPlaced && x === card.threadId)));
  };

  const addToCard = async (child: BoardEmail, cardThreadId: string) => {
    const res = await addThreadToCard(cardThreadId, snapshotOf(child));
    if (res.error || !res.card) return res.error ?? "Couldn't add it to that card.";
    absorb(res.card, child.threadId);
    return undefined;
  };

  // Tick a next action straight from the card.
  const toggleTask = useCallback(
    (cardId: string, taskId: string, done: boolean) => {
      const set = (v: boolean) =>
        setEmails((prev) => {
          const e = prev[cardId];
          if (!e) return prev;
          const task = e.tasks.find((t) => t.id === taskId);
          // Show the tick in the card's Latest straight away (and take it back on undo).
          const activity =
            v && task
              ? [{ kind: "taskDone", detail: task.title, at: new Date().toISOString() }, ...e.activity]
              : e.activity.filter((a, i) => !(i === 0 && a.kind === "taskDone" && a.detail === task?.title));
          return { ...prev, [cardId]: { ...e, activity, tasks: e.tasks.map((t) => (t.id === taskId ? { ...t, done: v } : t)) } };
        });
      set(done);
      void save(() => updateTask(taskId, { done }), () => set(!done));
    },
    [save],
  );

  // How long a card has been in its status; a long wait in a waiting status is flagged.
  const ageOf = useCallback(
    (threadId: string): CardAge | null => {
      const lane = lanes.find((l) => l.threadIds.includes(threadId));
      const since = lane?.since[threadId];
      if (!lane || lane.finished || !since) return null;
      const days = Math.floor((Date.now() - Date.parse(since)) / 86_400_000);
      if (days < 1) return null;
      return { text: `${days} day${days === 1 ? "" : "s"} in ${lane.name}`, stale: lane.reopenOnReply && days >= STALE_DAYS };
    },
    [lanes],
  );
  const cardBoard = {
    toggleTask,
    ageOf,
    statuses: lanes.map((l) => ({ id: l.id, name: l.name })),
    statusOf: (threadId: string) => lanes.find((l) => l.threadIds.includes(threadId))?.id ?? null,
    moveTo: (threadId: string, statusId: string | null) => void place(threadId, statusId ?? UNSORTED),
    canArchive: (threadId: string) =>
      isInbox && !recent && !emails[threadId]?.local && !lanes.some((l) => l.threadIds.includes(threadId)),
    archive: (threadId: string) => void archive(threadId, selected === threadId),
    canHide: (threadId: string) => !lanes.some((l) => l.threadIds.includes(threadId)) && !emails[threadId]?.hidden,
    hide: (threadId: string) => void hide(threadId, true),
    remove: (threadId: string) => void trash(threadId),
  };

  // ----- triage: archive, and keys to file the open email -----
  // After filing or archiving the open email, open the next one in the first column.
  const openNext = (threadId: string) => {
    const list = recent ? shownRecent : shownUnsorted;
    const i = list.indexOf(threadId);
    if (i < 0) return;
    setSelected(list[i + 1] ?? list[i - 1] ?? null);
  };

  const archive = async (threadId: string, advance: boolean) => {
    const e = emails[threadId];
    const ids = (e?.threads ?? []).map((t) => t.threadId).filter((t) => !t.startsWith("local:"));
    if (!e || ids.length === 0) return;
    if (advance) openNext(threadId);
    const before = unsorted;
    if (isInbox) setUnsorted((prev) => prev.filter((x) => x !== threadId));
    const res = await archiveThreads(ids);
    if (res.error || !res.labelIds) {
      setUnsorted(before);
      setSaveError(res.error ?? "Couldn't archive that email.");
      return;
    }
    const labels = res.labelIds;
    setEmails((prev) => {
      const cur = prev[threadId];
      if (!cur) return prev;
      return {
        ...prev,
        [threadId]: {
          ...cur,
          labelIds: labels[cur.threadId] ?? cur.labelIds,
          threads: cur.threads.map((t) => ({ ...t, labelIds: labels[t.threadId] ?? t.labelIds })),
        },
      };
    });
  };

  // Delete: the card's emails go to Gmail's Trash and the card leaves the board.
  // Undo (for a few seconds) brings them back to the first column.
  const [undo, setUndo] = useState<{ text: string; run: () => void } | null>(null);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(t);
  }, [undo]);

  const trash = async (threadId: string) => {
    const e = emails[threadId];
    const ids = (e?.threads ?? []).map((t) => t.threadId).filter((t) => !t.startsWith("local:"));
    if (!e || ids.length === 0) return;
    if (selected === threadId) {
      if (lanes.some((l) => l.threadIds.includes(threadId))) setSelected(null);
      else openNext(threadId);
    }
    const before = { lanes, unsorted, recentIds };
    const restore = () => {
      apply({ lanes: before.lanes, unsorted: before.unsorted });
      setRecentIds(before.recentIds);
    };
    apply({ lanes: lanes.map((l) => ({ ...l, threadIds: l.threadIds.filter((x) => x !== threadId) })), unsorted: unsorted.filter((x) => x !== threadId) });
    setRecentIds((prev) => prev.filter((x) => x !== threadId));
    const res = await trashCard(ids);
    if (res.error) {
      restore();
      setSaveError(res.error);
      return;
    }
    setUndo({
      text: `Moved “${e.title}” to Trash.`,
      run: async () => {
        setUndo(null);
        const back = await untrashCard(ids);
        if (back.error) return setSaveError(back.error);
        setUnsorted((prev) => byDate([...prev.filter((x) => x !== threadId), threadId]));
        setRecentIds((prev) => (prev.includes(threadId) ? prev : [threadId, ...prev]));
      },
    });
  };

  const hide = async (threadId: string, hidden: boolean) => {
    const e = emails[threadId];
    if (!e) return;
    if (hidden && selected === threadId) openNext(threadId);
    const set = (v: boolean) => setEmails((prev) => (prev[threadId] ? { ...prev, [threadId]: { ...prev[threadId], hidden: v } } : prev));
    set(hidden);
    await save(() => setHidden(snapshotOf(e), hidden), () => set(!hidden));
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || !selected) return;
      if ((ev.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      const fromFirst = !lanes.some((l) => l.threadIds.includes(selected));
      if (ev.key === "e" && isInbox && fromFirst) {
        ev.preventDefault();
        void archive(selected, true);
      } else if (ev.key === "#" && !emails[selected]?.local) {
        ev.preventDefault();
        void trash(selected);
      } else if (ev.key === "h" && fromFirst && !emails[selected]?.hidden) {
        ev.preventDefault();
        void hide(selected, true);
      } else if (/^[1-9]$/.test(ev.key) && lanes[Number(ev.key) - 1]) {
        ev.preventDefault();
        if (fromFirst) openNext(selected);
        void place(selected, lanes[Number(ev.key) - 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Opening a thread on a card marks that thread seen.
  const seenThread = (cardId: string, threadId: string) =>
    setEmails((prev) => {
      const e = prev[cardId];
      if (!e) return prev;
      const threads = e.threads.map((t) => (t.threadId === threadId ? { ...t, newReply: false } : t));
      return { ...prev, [cardId]: { ...e, threads, newReply: threads.some((t) => t.newReply), unread: threadId === cardId ? false : e.unread } };
    });

  const selectedEmail = selected ? emails[selected] : undefined;
  const activeEmail = activeId ? emails[activeId] : undefined;

  return (
    <CardBoardContext.Provider value={cardBoard}>
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
            { id: "unsorted", name: isInbox ? "Inbox" : "To triage", count: shownUnsorted.length },
            ...shownLanes.map((l) => ({ id: l.id, name: l.name, count: l.threadIds.length })),
            { id: "add", name: "+ Status", count: null },
          ]}
        />
        {/* On phones this row scrolls sideways, one column per screen; on desktop it dissolves. */}
        <div className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] md:contents">
        <InSidebar>
        {(docked) => (
        <UnsortedColumn
          docked={docked}
          title={recent && isInbox ? "Recent" : title}
          labelId={sourceLabelId}
          isLens={!!lens}
          isInbox={isInbox}
          recent={recent}
          onRecentChange={changeRecent}
          statusOf={statusOf}
          primaryOnly={primaryOnly}
          onPrimaryOnlyChange={changePrimaryOnly}
          threadIds={recent ? shownRecent : shownUnsorted}
          emails={emails}
          sortedCount={shownPlaced}
          newReplies={newReplies}
          query={query}
          searching={!!loadedQuery}
          state={listState}
          error={listError}
          hasMore={!!nextPage}
          laneCount={lanes.length}
          draggingFromStatus={!!activeId && lanes.some((l) => l.threadIds.includes(activeId)) && snapshot.current?.from !== UNSORTED}
          cutoff={!isInbox || recent ? { from: triageFrom, applies: cutoffApplies } : null}
          onShowOlder={setShowOlder}
          onMarkOlderDone={async (clear) => {
            const at = await setTriageFrom(clear ? null : "now");
            setTriageFromState(at);
            setShowOlder(false);
          }}
          hiddenIds={hiddenIds}
          onHide={(id) => void hide(id, true)}
          onTrash={(id) => void trash(id)}
          onUnhide={(id) => void hide(id, false)}
          onArchive={isInbox && !recent ? (id) => void archive(id, selected === id) : undefined}
          selected={selected}
          onQueryChange={setQuery}
          onSearch={() => {
            void load(query.trim());
            reloadLabels();
          }}
          onLoadMore={() => load(loadedQuery, nextPage)}
          onNewTicket={(title) =>
            save(async () => {
              const ticket = await createTicket(workspace.id, title, lens?.labelId);
              mergeEmails([ticket]);
              setUnsorted((prev) => [ticket.threadId, ...prev]);
              setSelected(ticket.threadId);
            }, () => {})
          }
          onOpen={setSelected}
          look={look}
        />
        )}
        </InSidebar>

        <section className="board-bg flex min-w-0 flex-1 gap-4 overflow-x-auto p-4 max-md:flex-none max-md:gap-3 max-md:overflow-visible max-md:p-3">
          {shownLanes.map((lane, i) => (
            <Lane
              key={lane.id}
              lane={lane}
              emails={emails}
              labelId={sourceLabelId}
              isFirst={i === 0}
              isLast={i === lanes.length - 1}
              onMove={(dir) => moveLane(i, dir)}
              onRename={async (name) => {
                const rename = (to: string) => setLanes((prev) => prev.map((l) => (l.id === lane.id ? { ...l, name: to } : l)));
                rename(name);
                await save(() => renameLane(lane.id, name), () => rename(lane.name));
              }}
              onDelete={() => removeLane(lane)}
              onReopenChange={async (on) => {
                const set = (v: boolean) => setLanes((prev) => prev.map((l) => (l.id === lane.id ? { ...l, reopenOnReply: v } : l)));
                set(on);
                await save(() => setLaneReopenOnReply(lane.id, on), () => set(!on));
              }}
              onFinishedChange={async (on) => {
                const set = (v: boolean) => setLanes((prev) => prev.map((l) => (l.id === lane.id ? { ...l, finished: v } : l)));
                set(on);
                await save(() => setLaneFinished(lane.id, on), () => set(!on));
              }}
              onOpen={setSelected}
              rows={orderedRows}
              rowOf={rowOf}
              showEmptyRows={!!activeId}
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
                placeholder="Add status"
                className="w-full rounded-2xl border-2 border-dashed border-faint bg-cream/85 py-2 pr-3 pl-9 text-sm font-semibold text-bark outline-none transition placeholder:text-muted hover:border-terracotta/60 hover:bg-cream focus:border-terracotta focus:bg-cream"
              />
            </form>
            {lanes.length === 0 && (
              <p className="card-tactile animate-rise rounded-2xl px-3 py-2 text-xs leading-relaxed text-bark">
                <ThemeIcon icon={look.icons.hint} size={16} className="mr-1" />
                Add statuses for your work to move through, for example To do, Waiting and Done, then drag emails into them.
              </p>
            )}
            <LaneTemplates
              templates={templates}
              hasLanes={lanes.length > 0}
              onUse={(t) =>
                save(async () => {
                  const added = await applyLaneTemplate(workspace.id, t.lanes);
                  setLanes((prev) => [...prev, ...added]);
                }, () => {})
              }
              onSave={(name) =>
                save(async () => {
                  const t = await saveLaneTemplate(name, lanes.map((l) => ({ name: l.name, reopenOnReply: l.reopenOnReply, finished: l.finished })));
                  setTemplates((prev) => [...prev, t]);
                }, () => {})
              }
              onDelete={(t) => {
                setTemplates((prev) => prev.filter((x) => x.id !== t.id));
                return save(() => deleteLaneTemplate(t.id), () => setTemplates((prev) => [...prev, t]));
              }}
            />
          </div>
        </section>
        </div>
      </div>

      {undo && (
        <div
          role="status"
          className="card-tactile fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl px-3 py-2 text-sm text-bark"
        >
          <span className="min-w-0 flex-1 truncate">{undo.text}</span>
          <button onClick={undo.run} className="font-bold text-terracotta hover:underline">
            Undo
          </button>
          <button onClick={() => setUndo(null)} className="text-muted hover:text-bark" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
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
        {activeEmail ? <CardFace email={activeEmail} hideLabelId={sourceLabelId} dragging /> : null}
      </DragOverlay>

      {selectedEmail && (
        <EmailPanel
          key={selectedEmail.threadId}
          email={selectedEmail}
          workspaceLabelId={sourceLabelId}
          onLabelsChange={(labelIds) => {
            const t = selectedEmail.threadId;
            mergeEmails([{ ...selectedEmail, labelIds }]);
            // Labels never move a card out of its status. An unsorted email that
            // loses this column's label (archived, for the Inbox) leaves the column;
            // one that gains it joins.
            if (!labelIds.includes(sourceLabelId)) setUnsorted((prev) => prev.filter((x) => x !== t));
            else if (!containerOf(t, { lanes, unsorted })) setUnsorted((prev) => byDate([...prev, t]));
          }}
          lanes={lanes}
          laneId={containerOf(selectedEmail.threadId, { lanes, unsorted }) ?? UNSORTED}
          onPlace={(laneId) => place(selectedEmail.threadId, laneId)}
          onChange={(e) => mergeEmails([e])}
          onSeenThread={(t) => seenThread(selectedEmail.threadId, t)}
          cardChoices={cardChoices}
          onAddToCard={async (cardThreadId) => {
            const err = await addToCard(selectedEmail, cardThreadId);
            if (!err) setSelected(cardThreadId);
            return err;
          }}
          onAddThread={async (thread) => {
            const res = await addThreadToCard(selectedEmail.threadId, thread);
            if (res.error || !res.card) return res.error ?? "Couldn't add that email.";
            absorb(res.card, thread.threadId);
            return undefined;
          }}
          onRemoveThread={async (threadId) => {
            const res = await removeThreadFromCard(threadId);
            if (res.error || !res.card) return res.error ?? "Couldn't take that email off.";
            mergeEmails([res.card, ...(res.thread ? [res.thread] : [])]);
            // It stays in the card's status, just below it; or joins the first column.
            const cardId = selectedEmail.threadId;
            if (lanes.some((l) => l.threadIds.includes(cardId)))
              setLanes((prev) => prev.map((l) => ({ ...l, threadIds: l.threadIds.flatMap((x) => (x === cardId ? [x, threadId] : [x])) })));
            else setUnsorted((prev) => byDate([...prev.filter((x) => x !== threadId), threadId]));
            return undefined;
          }}
          onTrash={() => void trash(selectedEmail.threadId)}
          onDelete={async () => {
            const t = selectedEmail.threadId;
            const before = { lanes, unsorted };
            setSelected(null);
            apply({ lanes: lanes.map((l) => ({ ...l, threadIds: l.threadIds.filter((x) => x !== t) })), unsorted: unsorted.filter((x) => x !== t) });
            await save(() => deleteTicket(t), () => apply(before));
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </DndContext>
    </CardBoardContext.Provider>
  );
}

// ---------- columns ----------

function UnsortedColumn(p: {
  docked: boolean; // shown at the bottom of the sidebar rather than as the board's first column
  laneCount: number;
  draggingFromStatus: boolean;
  cutoff: { from: string | null; applies: boolean } | null; // null in the Inbox's own triage column
  onShowOlder: (v: boolean) => void;
  onMarkOlderDone: (clear: boolean) => Promise<void>;
  hiddenIds: string[];
  onHide: (threadId: string) => void;
  onTrash: (threadId: string) => void;
  onUnhide: (threadId: string) => void;
  onArchive?: (threadId: string) => void;
  title: string;
  labelId: string;
  isLens: boolean;
  isInbox: boolean;
  recent: boolean;
  onRecentChange: (v: boolean) => void;
  statusOf: (threadId: string) => string | undefined;
  primaryOnly: boolean;
  onPrimaryOnlyChange: (v: boolean) => void;
  threadIds: string[];
  emails: Record<string, BoardEmail>;
  sortedCount: number;
  newReplies: number;
  query: string;
  searching: boolean;
  state: "loading" | "idle" | "error";
  error: string;
  hasMore: boolean;
  selected: string | null;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
  onLoadMore: () => void;
  onNewTicket: (title: string) => Promise<void>;
  onOpen: (threadId: string) => void;
  look: ReturnType<typeof useTheme>["theme"];
}) {
  const [ticket, setTicket] = useState<string | null>(null);
  const { setNodeRef, isOver } = useDroppable({ id: `${LANE}${UNSORTED}` });
  const w = useStoredWidth("mte.w.unsorted", 320, 220, 720);
  const { labelNames } = useMail();
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(GROUP_KEY);
      if (isGroupBy(saved)) setGroupBy(saved);
    } catch {}
  }, []);
  const changeGroupBy = (v: GroupBy) => {
    setGroupBy(v);
    try {
      localStorage.setItem(GROUP_KEY, v);
    } catch {}
  };
  const groups = useMemo(
    () => groupThreads(p.threadIds, p.emails, groupBy, { labelNames, hereLabelId: p.labelId }),
    [p.threadIds, p.emails, groupBy, labelNames, p.labelId],
  );
  return (
    <aside
      id="col-unsorted"
      className={
        p.docked
          ? "paper relative flex min-h-0 flex-1 flex-col"
          : "paper relative flex shrink-0 snap-start flex-col border-r border-line max-md:w-screen md:w-[var(--w)]"
      }
      style={p.docked ? undefined : widthVar(w.width)}
    >
      {!p.docked && <ResizeHandle width={w.width} onResize={w.setWidth} onDone={w.save} onReset={w.reset} label="Resize email column" />}
      <div className="space-y-2 border-b border-dashed border-line-strong p-3">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate text-xl font-semibold text-walnut" title={p.title}>
            {p.title.split("/").join(" › ")}
          </h1>
          {p.isInbox && !p.recent && (
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
        <div className="flex overflow-hidden rounded-full border border-line-strong bg-cream text-xs font-semibold">
          {[false, true].map((v) => (
            <button
              key={String(v)}
              onClick={() => p.onRecentChange(v)}
              className={`flex-1 px-2.5 py-0.5 transition ${p.recent === v ? "bg-moss text-cream" : "text-bark hover:bg-oat"}`}
              title={v ? "Labelled mail that isn't in a status yet, newest first" : "Emails not yet in a status"}
            >
              {v ? "Recent" : "To triage"}
            </button>
          ))}
        </div>
        {p.onArchive && p.laneCount > 0 && (
          <p className="text-xs text-muted" title="Keyboard shortcuts while an email is open">
            Open an email, then <kbd className="font-semibold">1</kbd>–<kbd className="font-semibold">{Math.min(p.laneCount, 9)}</kbd> files it
            into a status, <kbd className="font-semibold">e</kbd> archives it, <kbd className="font-semibold">h</kbd> hides it, <kbd className="font-semibold">#</kbd> deletes it.
          </p>
        )}
        {p.isLens && (
          <p className="text-xs text-muted">
            Your workflow, showing only this label&apos;s cards.{" "}
            <Link href="/l/INBOX" className="font-semibold text-terracotta hover:underline">
              Back to Inbox
            </Link>
          </p>
        )}
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
        {ticket === null ? (
          <button onClick={() => setTicket("")} className="text-xs font-semibold text-terracotta hover:underline">
            + New ticket (no email)
          </button>
        ) : (
          <form
            className="flex gap-1.5"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!ticket.trim()) return;
              await p.onNewTicket(ticket);
              setTicket(null);
            }}
          >
            <input
              autoFocus
              value={ticket}
              onChange={(e) => setTicket(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setTicket(null)}
              placeholder="What needs doing?"
              className="field min-w-0 flex-1 rounded-xl px-2.5 py-1 text-sm"
            />
            <button disabled={!ticket.trim()} className="btn-press rounded-xl bg-moss px-2.5 text-sm font-bold text-cream disabled:opacity-50">
              Add
            </button>
          </form>
        )}
        <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          Group by
          <select
            value={groupBy}
            onChange={(e) => changeGroupBy(e.target.value as GroupBy)}
            className="field rounded-lg px-1.5 py-0.5 text-xs text-bark"
          >
            {GROUP_BY.map((g) => (
              <option key={g} value={g}>
                {GROUP_BY_NAMES[g]}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs font-semibold text-muted">
          {p.searching ? "Search results" : p.recent ? (p.isInbox ? "Labelled, not in a status yet, newest first" : "Not in a status yet, newest first") : "Not in a status yet"}
          {!p.recent && ` · ${p.threadIds.length}${p.hasMore ? "+" : ""}`}
          {!p.recent && p.sortedCount > 0 && ` · ${p.sortedCount} in statuses`}
          {p.newReplies > 0 && (
            <span className="text-accent-ink">
              {" · "}
              {p.newReplies} new {p.newReplies === 1 ? "reply" : "replies"} in statuses
            </span>
          )}
        </p>
      </div>
      <div ref={setNodeRef} className={`min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5 transition-colors ${isOver ? "bg-oat/60" : ""}`}>
        {p.draggingFromStatus && <DropBack />}
        {p.state === "error" && <p className="p-2 text-sm text-red-600">{p.error}</p>}
        {groups.map((g) => (
          <div key={g.key} className="space-y-2.5">
            {g.title && (
              <h4 className="sticky top-0 z-[1] -mx-2.5 flex items-baseline gap-2 bg-paper/95 px-3 pt-1 pb-0.5 text-xs font-bold text-bark">
                <span className="min-w-0 flex-1 truncate">{g.title}</span>
                <span className="text-muted">{g.threadIds.length}</span>
              </h4>
            )}
            {g.threadIds.map((id) =>
              p.emails[id] ? (
                p.statusOf(id) ? (
                  // Already in a status: shown for the record, opened with a click.
                  <div
                    key={id}
                    role="button"
                    tabIndex={0}
                    onClick={() => p.onOpen(id)}
                    onKeyDown={(e) => e.key === "Enter" && p.onOpen(id)}
                    className={`block w-full cursor-pointer text-left ${p.selected === id ? "rounded-2xl ring-2 ring-terracotta ring-offset-2 ring-offset-paper" : ""}`}
                  >
                    <span className="mb-1 block px-1 text-xs font-semibold text-muted">→ {p.statusOf(id)}</span>
                    <CardFace email={p.emails[id]} hideLabelId={p.labelId} />
                  </div>
                ) : (
                  <DraggableEmail
                    key={id}
                    email={p.emails[id]}
                    labelId={p.labelId}
                    selected={p.selected === id}
                    onOpen={() => p.onOpen(id)}
                    onArchive={p.onArchive && !p.emails[id].local ? () => p.onArchive!(id) : undefined}
                    onHide={() => p.onHide(id)}
                    onTrash={!p.emails[id].local ? () => p.onTrash(id) : undefined}
                  />
                )
              ) : null,
            )}
          </div>
        ))}
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
        {p.cutoff && p.state === "idle" && !p.searching && (
          <div className="rounded-2xl border border-dashed border-line px-3 py-2 text-xs text-muted">
            {p.cutoff.from ? (
              <>
                {p.cutoff.applies
                  ? `Labelled mail from before ${new Date(p.cutoff.from).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })} counts as done. `
                  : "Showing older mail too. "}
                <button onClick={() => p.onShowOlder(p.cutoff!.applies)} className="font-semibold text-terracotta hover:underline">
                  {p.cutoff.applies ? "Show older" : "Hide older"}
                </button>
                {" · "}
                <button onClick={() => p.onMarkOlderDone(false)} className="font-semibold hover:text-terracotta hover:underline" title="Everything labelled until now counts as done">
                  Mark all up to now as done
                </button>
              </>
            ) : (
              <>
                Old labelled mail that needs nothing?{" "}
                <button onClick={() => p.onMarkOlderDone(false)} className="font-semibold text-terracotta hover:underline" title="Everything labelled until now counts as done; new messages still show">
                  Mark everything up to now as done
                </button>
              </>
            )}
          </div>
        )}
        {p.hiddenIds.length > 0 && (
          <details className="rounded-2xl border border-dashed border-line px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-muted">
              Hidden · {p.hiddenIds.length} <span className="font-normal">(no tracking needed; back if a new message arrives)</span>
            </summary>
            <ul className="mt-2 space-y-1">
              {p.hiddenIds.map((id) => (
                <li key={id} className="flex items-baseline gap-2 text-sm">
                  <button onClick={() => p.onOpen(id)} className="min-w-0 flex-1 truncate text-left text-bark hover:text-terracotta">
                    {p.emails[id]?.title}
                  </button>
                  <button onClick={() => p.onUnhide(id)} className="shrink-0 text-xs font-semibold text-muted hover:text-terracotta">
                    Unhide
                  </button>
                </li>
              ))}
            </ul>
          </details>
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

// Shown while a card is dragged out of a status: drop it here to take it out
// of the workflow and back into the first column.
function DropBack() {
  const { setNodeRef, isOver } = useDroppable({ id: `${LANE}${UNSORTED}#back` });
  return (
    <div
      ref={setNodeRef}
      className={`sticky top-0 z-[2] rounded-2xl border-2 border-dashed px-3 py-4 text-center text-sm font-semibold transition ${
        isOver ? "border-terracotta bg-accent-soft text-accent-ink" : "border-faint bg-paper/95 text-bark"
      }`}
    >
      ↩ Drop here to take it out of the workflow
    </div>
  );
}

function DraggableEmail({
  email,
  labelId,
  selected,
  onOpen,
  onArchive,
  onHide,
  onTrash,
}: {
  email: BoardEmail;
  labelId: string;
  selected: boolean;
  onOpen: () => void;
  onArchive?: () => void;
  onHide?: () => void;
  onTrash?: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${T}${email.threadId}` });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={`group/drag relative touch-manipulation ${isDragging ? "opacity-30" : ""} ${selected ? "rounded-2xl ring-2 ring-terracotta ring-offset-2 ring-offset-paper" : ""}`}
    >
      <CardFace email={email} hideLabelId={labelId} />
      {(onArchive || onHide) && (
        // Desktop: on hover. Phones use the buttons on the card itself.
        <div className="absolute right-2 bottom-2 flex gap-1 opacity-0 transition group-hover/drag:opacity-100 max-md:hidden">
          {[
            { label: "Hide", title: "Hide: doesn't need tracking (h). It comes back if a new message arrives.", run: onHide },
            { label: "Archive", title: "Archive in Gmail: needs nothing (e)", run: onArchive },
            { label: "Delete", title: "Move to Gmail's Trash (#). Undo straight after, or restore from Trash for 30 days.", run: onTrash },
          ]
            .filter((b) => b.run)
            .map((b) => (
              <button
                key={b.label}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  b.run!();
                }}
                className="btn-press rounded-lg bg-oat px-2 py-0.5 text-xs font-semibold text-bark hover:text-terracotta"
                title={b.title}
              >
                {b.label}
              </button>
            ))}
        </div>
      )}
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
  onReopenChange,
  onFinishedChange,
  onOpen,
  rows,
  showEmptyRows,
  rowOf,
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
  onReopenChange: (on: boolean) => Promise<void>;
  onFinishedChange: (on: boolean) => Promise<void>;
  onOpen: (threadId: string) => void;
  rows: Row[] | null;
  showEmptyRows: boolean; // empty sub-labels stay hidden except while a card is being dragged
  rowOf: (e: BoardEmail | undefined) => string;
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
      <ResizeHandle width={width.width} onResize={width.setWidth} onDone={width.save} onReset={width.reset} label="Resize statuses" />
      <div className="group flex items-center gap-1 px-3 pt-2.5 pb-1">
        <ThemeIcon icon={icon} size={20} className="cursor-default text-lg hover:animate-wiggle" />
        <InlineEdit value={lane.name} onSave={onRename} className={`font-display text-base font-semibold ${colors.text}`} />
        <span key={lane.threadIds.length} className={`animate-pop rounded-full px-2 text-[11px] font-bold text-cream ${colors.count}`}>
          {lane.threadIds.length}
        </span>
        {lane.reopenOnReply && (
          <span className="text-xs text-muted" title="A new reply sends a card back to the first column">
            ↩
          </span>
        )}
        {lane.finished && (
          <span className="text-xs text-muted" title="Finished: cards here are archived in Gmail and drop off after two weeks">
            ✓
          </span>
        )}
        <div className="ml-auto flex items-center opacity-0 transition group-hover:opacity-100 max-md:opacity-100">
          <button
            onClick={() => onReopenChange(!lane.reopenOnReply)}
            className={`px-1 text-xs ${lane.reopenOnReply ? "font-bold text-terracotta" : "text-muted"}`}
            title={
              lane.reopenOnReply
                ? "New replies send cards back to the first column. Click to stop."
                : "Send cards back to the first column when a new reply arrives"
            }
            aria-pressed={lane.reopenOnReply}
          >
            ↩
          </button>
          <button
            onClick={() => onFinishedChange(!lane.finished)}
            className={`px-1 text-xs ${lane.finished ? "font-bold text-terracotta" : "text-muted"}`}
            title={
              lane.finished
                ? "Finished: cards moved here are archived in Gmail and drop off after two weeks. Click to stop."
                : "Mark as finished: cards moved here are archived in Gmail and drop off after two weeks"
            }
            aria-pressed={lane.finished}
          >
            ✓
          </button>
          <button disabled={isFirst} onClick={() => onMove(-1)} className="px-1 text-muted disabled:opacity-30" title="Move left">
            ‹
          </button>
          <button disabled={isLast} onClick={() => onMove(1)} className="px-1 text-muted disabled:opacity-30" title="Move right">
            ›
          </button>
          <ConfirmButton label="✕" confirmLabel="Delete status?" onConfirm={onDelete} small />
        </div>
      </div>
      <div ref={setNodeRef} className={`flex min-h-24 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-2.5 ${isOver && !rows ? "rounded-2xl bg-cream/50" : ""}`}>
        {rows ? (
          rows.map((r) => {
            const ids = lane.threadIds.filter((t) => rowOf(emails[t]) === r.key);
            if (!ids.length && !showEmptyRows) return null;
            return <RowGroup key={r.key} laneId={lane.id} row={r} threadIds={ids} emails={emails} labelId={labelId} onOpen={onOpen} />;
          })
        ) : (
          <SortableContext items={lane.threadIds.map((t) => `${T}${t}`)} strategy={verticalListSortingStrategy}>
            {lane.threadIds.map((t) =>
              emails[t] ? <SortableEmail key={t} email={emails[t]} labelId={labelId} onOpen={() => onOpen(t)} /> : null,
            )}
          </SortableContext>
        )}
      </div>
    </div>
  );
}

// One row (sub-label) within a status. Dropping a card here gives it that sub-label.
function RowGroup({
  laneId,
  row,
  threadIds,
  emails,
  labelId,
  onOpen,
}: {
  laneId: string;
  row: Row;
  threadIds: string[];
  emails: Record<string, BoardEmail>;
  labelId: string;
  onOpen: (threadId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${LANE}${laneId}#${row.key}` });
  return (
    <div ref={setNodeRef} className={`space-y-2 rounded-2xl p-1 transition-colors ${isOver ? "bg-cream/60" : ""}`}>
      <h4 className="flex items-baseline gap-2 px-1 text-xs font-bold text-bark">
        <span className="min-w-0 flex-1 truncate" title={row.path}>
          {row.name}
        </span>
        <span className="text-muted">{threadIds.length}</span>
      </h4>
      <SortableContext items={threadIds.map((t) => `${T}${t}`)} strategy={verticalListSortingStrategy}>
        {threadIds.map((t) => (emails[t] ? <SortableEmail key={t} email={emails[t]} labelId={labelId} onOpen={() => onOpen(t)} /> : null))}
      </SortableContext>
      {threadIds.length === 0 && <div className="h-8 rounded-xl border border-dashed border-line" />}
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

// Start a board from a set of lanes, or keep this board's lanes for next time.
function LaneTemplates({
  templates,
  hasLanes,
  onUse,
  onSave,
  onDelete,
}: {
  templates: LaneTemplateDTO[];
  hasLanes: boolean;
  onUse: (t: LaneTemplateDTO) => Promise<void>;
  onSave: (name: string) => Promise<void>;
  onDelete: (t: LaneTemplateDTO) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  const showList = !hasLanes || open;

  return (
    <div className="space-y-1.5 text-xs">
      {hasLanes && (
        <div className="flex gap-3 px-1 font-semibold text-muted">
          <button onClick={() => setOpen((v) => !v)} className="hover:text-terracotta">
            {open ? "Hide templates" : "Add statuses from a template"}
          </button>
          {naming === null && (
            <button onClick={() => setNaming("")} className="hover:text-terracotta">
              Save as template
            </button>
          )}
        </div>
      )}
      {naming !== null && (
        <form
          className="flex gap-1.5"
          onSubmit={async (e) => {
            e.preventDefault();
            await run(() => onSave(naming));
            setNaming(null);
          }}
        >
          <input
            autoFocus
            value={naming}
            disabled={busy}
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setNaming(null)}
            placeholder="Template name"
            className="field min-w-0 flex-1 rounded-xl px-2 py-1"
          />
          <button disabled={busy || !naming.trim()} className="btn-press rounded-xl bg-moss px-2.5 font-bold text-cream disabled:opacity-50">
            Save
          </button>
        </form>
      )}
      {showList && (
        <div className="space-y-1.5">
          {!hasLanes && <p className="px-1 font-semibold text-muted">Or start from a template:</p>}
          {templates.map((t) => (
            <div key={t.id} className="card-tactile flex items-start gap-2 rounded-xl px-2.5 py-1.5">
              <button disabled={busy} onClick={() => run(() => onUse(t))} className="min-w-0 flex-1 text-left disabled:opacity-50">
                <span className="block font-semibold text-walnut">{t.name}</span>
                <span className="block truncate text-muted">
                  {t.lanes.map((l) => l.name + (l.reopenOnReply ? " ↩" : "")).join(" · ")}
                </span>
              </button>
              {!t.builtIn && <ConfirmButton label="✕" confirmLabel="Delete?" onConfirm={() => onDelete(t)} small />}
            </div>
          ))}
        </div>
      )}
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
