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
  applyLaneTemplate,
  arrangeEmails,
  createLane,
  createWorkspace,
  deleteLaneTemplate,
  deleteTicket,
  deleteLane,
  fetchLabelEmails,
  fetchSentStarted,
  refreshEmails,
  removeThreadFromCard,
  renameLane,
  setHidden,
  createTicket,
  setTriageFrom,
  trashCard,
  untrashCard,
  reorderLanes,
  saveLaneTemplate,
  setEmailLabels,
  setLaneFinished,
  setLaneReopenOnReply,
  triageWaiting,
  updateTask,
} from "@/app/actions";
import type { BoardEmail, LaneDTO, LaneTemplateDTO, ThreadSnapshot, WorkspaceDTO } from "@/lib/types";
import { CardFace, CardBoardContext, type CardAge } from "./CardFace";
import { EmailPanel, UNSORTED, type CardChoice } from "./EmailPanel";
import { byCardDate, cardLabelIds, hasOwnLabel, senderAddress } from "@/lib/cards";
import { useMail } from "./MailContext";
import { ConfirmButton, InlineEdit } from "./ui";
import { ResizeHandle, useStoredWidth, widthVar } from "./Resizable";
import { ThemeIcon, useTheme } from "./ThemeContext";
import { CalendarBoard } from "./CalendarBoard";
import { NewCardForm } from "./NewCard";
import { ListView } from "./ListView";
import { TodayView } from "./TodayView";
import { TasksView } from "./TasksView";
import { FileUnder } from "./FileUnder";
import type { Due } from "./DuePicker";

const VIEW_KEY = "mte.view"; // the last view picked: "today" (Summary, the default), "tasks", "list", "lanes" or "calendar"
type BoardView = "lanes" | "calendar" | "list" | "today" | "tasks";
const VIEWS: { id: BoardView; name: string }[] = [
  { id: "today", name: "☀ Summary" },
  { id: "tasks", name: "✓ Tasks" },
  { id: "list", name: "☰ List" },
  { id: "lanes", name: "▥ Lanes" },
  { id: "calendar", name: "▦ Calendar" },
];

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
const REFRESH_MS = 2 * 60_000; // how often cards in a status are checked for new replies

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
  ignoredSenders: initialIgnored,
}: {
  workspace: WorkspaceDTO;
  initialEmails: Record<string, BoardEmail>;
  initialThreadId?: string;
  templates: LaneTemplateDTO[];
  triageFrom: string | null;
  ignoredSenders: string[];
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
  // The same test for bare label ids (Today's sent mail and recently opened).
  const inLensIds = useCallback(
    (ids: string[]) => {
      if (!lens) return true;
      const prefix = `${labelNames.get(lens.labelId) ?? lens.name}/`;
      return ids.some((id) => id === lens.labelId || !!labelNames.get(id)?.startsWith(prefix));
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
  const lanesRef = useRef(lanes);
  useEffect(() => {
    lanesRef.current = lanes;
  }, [lanes]);
  const emailsRef = useRef(emails);
  useEffect(() => {
    placedRef.current = placed;
    emailsRef.current = emails;
  }, [placed, emails]);

  // ----- the label's emails from Gmail (unsorted column) -----
  const primaryOnly = false; // every inbox tab, so nothing is missed
  // The first column shows what's left to triage, or everything recent (newest
  // first, cards already in a status included) so nothing active is out of sight.
  const [recentIds, setRecentIds] = useState<string[]>([]);
  // New emails you sent (conversations you started, not in the inbox): the Inbox
  // column shows them too, so they can go on the board like incoming mail.
  const [sentIds, setSentIds] = useState<string[]>([]);
  // Labelled mail older than this counts as done (not used for the Inbox itself).
  const [triageFrom, setTriageFromState] = useState(initialTriageFrom);
  // The setting can change from the sidebar; follow it.
  useEffect(() => setTriageFromState(initialTriageFrom), [initialTriageFrom]);
  const [showOlder, setShowOlder] = useState(false);
  const cutoffApplies = !!triageFrom && !showOlder;
  const [prefsReady, setPrefsReady] = useState(false);
  const [view, setView] = useState<BoardView>("today");
  // Senders ignored earlier (listed in Settings) stay out of the Inbox column.
  const ignored = useMemo(() => new Set(initialIgnored), [initialIgnored]);
  // A finished status that just took a card: it says so for a moment.
  const [justDone, setJustDone] = useState<string | null>(null);
  useEffect(() => {
    if (!justDone) return;
    const t = setTimeout(() => setJustDone(null), 1600);
    return () => clearTimeout(t);
  }, [justDone]);
  const load = useCallback(
    async () => {
      const res = await fetchLabelEmails(sourceLabelId, {
        primaryOnly,
        includeOlder: showOlder,
      });
      if (res.error) return;
      mergeEmails(res.emails);
      // Emails added to a card show as that card.
      const cardIds = [...new Set(res.emails.map((e) => e.partOf ?? e.threadId))];
      setRecentIds(cardIds);
      const missing = cardIds.filter((id) => !emailsRef.current[id] && !res.emails.some((e) => e.threadId === id));
      if (missing.length) void refreshEmails(missing).then((r) => mergeEmails(r.emails));
      // Cards already in a status, Done cards, and emails added to a card, aren't unsorted.
      // A Done card with a new reply comes back to triage (and out of Done).
      const reopens = new Set(lanesRef.current.filter((l) => l.reopenOnReply).map((l) => l.id));
      const reopenedDone = res.emails
        .filter((e) => e.done && e.newReply && !e.partOf && !!e.doneLaneId && reopens.has(e.doneLaneId))
        .map((e) => e.threadId);
      if (reopenedDone.length) {
        setEmails((prev) => {
          const next = { ...prev };
          for (const id of reopenedDone) if (next[id]) next[id] = { ...next[id], done: false, doneLaneId: null };
          return next;
        });
        void save(() => arrangeEmails(workspace.id, { lanes: [], unsorted: reopenedDone, snapshots: [] }), () => {});
      }
      const ids = res.emails
        .filter((e) => !e.hidden && !placedRef.current.has(e.threadId) && !(e.homeId && e.homeId !== workspace.id) && !e.partOf)
        .filter((e) => !e.done || reopenedDone.includes(e.threadId))
        .map((e) => e.threadId);
      // Tickets with no email aren't in Gmail's list; keep the unsorted ones.
      const tickets = Object.values(emailsRef.current)
        .filter((e) => e.local && !placedRef.current.has(e.threadId))
        .map((e) => e.threadId);
      setUnsorted([...tickets, ...ids]);
      if (isInbox) {
        const sent = await fetchSentStarted();
        if (!sent.error) {
          mergeEmails(sent.emails);
          const fresh = sent.emails
            .filter((e) => !e.hidden && !placedRef.current.has(e.threadId) && !(e.homeId && e.homeId !== workspace.id) && !e.done)
            .map((e) => e.threadId);
          setSentIds(sent.emails.map((e) => e.threadId));
          setUnsorted((prev) => [...prev, ...fresh.filter((id) => !prev.includes(id))]);
        }
      }
    },
    // triageFrom: the server applies it, so a new cut-off must reload the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceLabelId, isInbox, workspace.id, primaryOnly, showOlder, triageFrom, mergeEmails],
  );

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "calendar" || v === "lanes" || v === "list" || v === "tasks") setView(v);
    } catch {}
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    if (prefsReady) void load();
  }, [prefsReady, load]);

  // Emails sorted into lanes may be far down the label; refresh them directly
  // so new replies show. Also fetch an email linked to directly (?thread=).
  const [refreshIds] = useState(() => [
    ...new Set([...workspace.lanes.flatMap((l) => l.threadIds), ...(initialThreadId ? [initialThreadId] : [])]),
  ]);
  useEffect(() => {
    void refreshEmails(refreshIds).then((r) => mergeEmails(r.emails));
  }, [refreshIds, mergeEmails]);
  // Then keep checking while the board is open: when the tab comes back into
  // view, and every couple of minutes while it's visible.
  useEffect(() => {
    let last = Date.now();
    const check = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 30_000) return;
      last = Date.now();
      const ids = [...new Set(lanesRef.current.flatMap((l) => l.threadIds))];
      void refreshEmails(ids).then((r) => mergeEmails(r.emails));
    };
    const timer = setInterval(check, REFRESH_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [mergeEmails]);

  // Open a card or email, fetching it first if the board hasn't loaded it.
  const openAny = (threadId: string) => {
    if (emails[threadId]) return setSelected(threadId);
    void refreshEmails([threadId]).then((r) => {
      mergeEmails(r.emails);
      if (r.emails.some((e) => e.threadId === threadId)) setSelected(threadId);
    });
  };

  const changeView = (v: BoardView) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
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
    }
    // A finished status takes the card off the board (it's in the List).
    const finished = from !== to && !!lanes.find((l) => l.id === to)?.finished;
    const affected = new Set([from, to].filter((x): x is string => !!x && x !== UNSORTED));
    const email = emailsRef.current[threadId] ?? emails[threadId];
    await save(
      () =>
        arrangeEmails(workspace.id, {
          lanes: cols.lanes.filter((l) => affected.has(l.id)).map((l) => ({ laneId: l.id, threadIds: l.threadIds })),
          unsorted: to === UNSORTED ? [threadId] : [],
          snapshots: to !== UNSORTED && email ? [snapshotOf(email)] : [],
        }),
      () => apply(before),
    );
    if (!finished && emails[threadId]?.done)
      setEmails((prev) => (prev[threadId] ? { ...prev, [threadId]: { ...prev[threadId], done: false, doneLaneId: null } } : prev));
    if (finished) {
      setJustDone(to);
      setLanes((prev) => prev.map((l) => (l.id === to ? { ...l, threadIds: l.threadIds.filter((x) => x !== threadId) } : l)));
      setEmails((prev) => (prev[threadId] ? { ...prev, [threadId]: { ...prev[threadId], done: true, doneLaneId: to } } : prev));
      if (selected === threadId) setSelected(null);
    }
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
  const [overLane, setOverLane] = useState<string | null>(null);
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
  // A label's first column: what's left to triage (not in a status, not filed).
  const isIgnored = useCallback(
    (e: BoardEmail | undefined) => isInbox && !!e && !e.local && ignored.has(senderAddress(e.from)),
    [isInbox, ignored],
  );
  const shownUnsorted = useMemo(
    () =>
      inFirstColumn
        .filter((t) => !emails[t]?.hidden && !isIgnored(emails[t]))
        .sort((a, b) => Number(!!emails[b]?.local) - Number(!!emails[a]?.local) || byCardDate(emails[a], emails[b])),
    [inFirstColumn, emails, isIgnored],
  );
  // The Inbox column is Gmail's inbox as it is: every thread there, newest first,
  // including cards in a status, Done or Filed (tagged). Archiving takes one out.
  // Tickets with no email that aren't in a status sit at the top.
  function isSentOnly(t: string) {
    const e = emails[t];
    return !!e && !e.partOf && !e.done && !e.hidden && !cardLabelIds(e).includes("INBOX") && !lanes.some((l) => l.threadIds.includes(t));
  }
  const shownInbox = useMemo(
    () => [
      ...inFirstColumn.filter((t) => emails[t]?.local && !emails[t].hidden),
      ...[
        ...recentIds.filter((t) => emails[t] && !emails[t].local && !emails[t].hidden && cardLabelIds(emails[t]).includes("INBOX") && !isIgnored(emails[t])),
        ...sentIds.filter((t) => isSentOnly(t) && !recentIds.includes(t)),
      ].sort((a, b) => byCardDate(emails[a], emails[b])),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inFirstColumn, recentIds, sentIds, emails, isIgnored, lanes],
  );
  const tagOf = (threadId: string) => {
    const e = emails[threadId];
    return statusOf(threadId) ?? (e?.done ? "Done" : e?.hidden ? "Filed" : sentIds.includes(threadId) && !cardLabelIds(e).includes("INBOX") ? "Sent" : undefined);
  };
  const statusOf = (threadId: string) => lanes.find((l) => l.threadIds.includes(threadId))?.name;
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
  // New replies anywhere on the board show in the tab title, so they're seen from other tabs.
  const allNewReplies = lanes.flatMap((l) => l.threadIds).filter((t) => emails[t]?.newReply).length;
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = allNewReplies ? `(${allNewReplies}) ${base}` : base;
  }, [allNewReplies]);


  // The mail still to triage: shown in the List tab, and used by "open next".
  const firstList = isInbox ? shownInbox : shownUnsorted;

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

  // Cards follow the pointer into lanes while dragging; the drop saves the move.
  function onDragOver({ active, over }: DragOverEvent) {
    const id = fromId(String(active.id));
    const cols = { lanes, unsorted };
    const target = over ? targetOf(String(over.id), cols) : undefined;
    setOverLane(target && target !== UNSORTED ? target : null);
    if (!over) return;
    if (!target || target === UNSORTED || target === containerOf(id, cols)) return;
    const before = String(over.id).startsWith(T) ? fromId(String(over.id)) : undefined;
    apply(moveInto(cols, id, target, before));
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    const snap = snapshot.current;
    snapshot.current = null;
    setActiveId(null);
    setOverLane(null);
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

  // A new card with no email, from the "+" in each view: in a status (Lanes), due
  // on a day (Calendar) or filed as information (File). One made in a finished
  // status goes straight to the List.
  const newCard = async (
    title: string,
    opts: { laneId?: string; dueDate?: string | null; dueTime?: boolean; filed?: boolean; task?: boolean } = {},
  ) => {
    const card = await createTicket(workspace.id, title, lens?.labelId, opts);
    mergeEmails([card]);
    if (opts.laneId && card.done) setJustDone(opts.laneId);
    else if (opts.laneId) {
      const now = new Date().toISOString();
      setLanes((prev) =>
        prev.map((l) => (l.id === opts.laneId ? { ...l, threadIds: [...l.threadIds, card.threadId], since: { ...l.since, [card.threadId]: now } } : l)),
      );
    } else setUnsorted((prev) => [card.threadId, ...prev]);
    return card;
  };

  // Move a next action's due date from the calendar.
  const reschedule = (cardId: string, taskId: string, due: Due) => {
    const before = emails[cardId]?.tasks.find((t) => t.id === taskId);
    if (!before) return;
    const set = (d: Due) =>
      setEmails((prev) => {
        const e = prev[cardId];
        return e ? { ...prev, [cardId]: { ...e, tasks: e.tasks.map((t) => (t.id === taskId ? { ...t, ...d } : t)) } } : prev;
      });
    set(due);
    void save(() => updateTask(taskId, due), () => set({ dueDate: before.dueDate, dueTime: before.dueTime }));
  };

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
    canFile: (threadId: string) => !lanes.some((l) => l.threadIds.includes(threadId)) && !emails[threadId]?.hidden,
    file: (threadId: string) => void file(threadId, true),
    label: (threadId: string) => setLabelAsk([threadId]),
    remove: (threadId: string) => void trash(threadId),
  };

  // ----- triage: keys to file the open email -----
  // After filing the open email, open the next one in the first column.
  const openNext = (threadId: string) => {
    const list = firstList;
    const i = list.indexOf(threadId);
    if (i < 0) return;
    setSelected(list[i + 1] ?? list[i - 1] ?? null);
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
    const e = emailsRef.current[threadId] ?? emails[threadId];
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

  const fileNow = async (threadId: string, filed: boolean) => {
    const e = emailsRef.current[threadId] ?? emails[threadId];
    if (!e) return;
    if (filed && selected === threadId) openNext(threadId);
    const set = (v: boolean) => setEmails((prev) => (prev[threadId] ? { ...prev, [threadId]: { ...prev[threadId], hidden: v } } : prev));
    set(filed);
    // Filing only hides it here: the email stays exactly where it is in Gmail.
    await save(() => setHidden(snapshotOf(e), filed), () => set(!filed));
  };

  // Only labelled things are filed: anything without a label asks for one first
  // (the rest of the mail is ignored or deleted, not filed).
  const [fileAsk, setFileAsk] = useState<string[] | null>(null);
  // Quick label: add a label to an email without filing it.
  const [labelAsk, setLabelAsk] = useState<string[] | null>(null);
  const file = (threadId: string, filed: boolean) => fileMany([threadId], filed);
  const fileMany = (ids: string[], filed = true) => {
    const known = ids.filter((id) => emails[id]);
    if (!filed) return void known.forEach((id) => void fileNow(id, false));
    const ready = known.filter((id) => hasOwnLabel(emails[id]));
    ready.forEach((id) => void fileNow(id, true));
    const ask = known.filter((id) => !ready.includes(id));
    if (ask.length) setFileAsk(ask);
  };
  // Label them, then file them. Returns an error to show in the dialog.
  const fileUnder = async (ids: string[], label: { id: string } | { name: string }, andFile = true): Promise<string | undefined> => {
    let labelId: string;
    if ("id" in label) labelId = label.id;
    else {
      const made = await createWorkspace(label.name);
      if (made.error || !made.label) return made.error ?? "Couldn't create the label.";
      labelId = made.label.id;
      reloadLabels();
    }
    for (const id of ids) {
      const res = await setEmailLabels(id, [labelId], []);
      if (res.error || !res.labelIds) return res.error ?? "Couldn't add the label.";
      const labelIds = res.labelIds;
      setEmails((prev) => {
        const cur = prev[id];
        if (!cur) return prev;
        return { ...prev, [id]: { ...cur, labelIds, threads: cur.threads.map((t) => (t.threadId === id ? { ...t, labelIds } : t)) } };
      });
      if (andFile) void fileNow(id, true);
    }
    setFileAsk(null);
    setLabelAsk(null);
    return undefined;
  };

  // The waiting list can show sent mail the app has never stored. Bring it in
  // first, then use the same file/trash paths as a card. Gmail labels don't change.
  const ensureWaitingCard = async (threadId: string) => {
    if (emailsRef.current[threadId]) return emailsRef.current[threadId];
    const res = await triageWaiting([threadId]);
    if (res.error || !res.emails.length) {
      setSaveError(res.error ?? "Couldn't find that email.");
      return null;
    }
    mergeEmails(res.emails);
    for (const e of res.emails) emailsRef.current[e.threadId] = e;
    return res.emails[0];
  };
  const addToBoardFromWaiting = async (threadId: string) => {
    if (!(await ensureWaitingCard(threadId))) return;
    const first = lanes[0];
    if (!first) return setSaveError("Add a status to the board first.");
    await place(threadId, first.id);
  };
  const fileFromWaiting = async (threadId: string) => {
    const card = await ensureWaitingCard(threadId);
    if (!card) return;
    if (!hasOwnLabel(card)) setFileAsk([threadId]);
    else await fileNow(threadId, true);
  };
  const trashFromWaiting = async (threadId: string) => {
    if (await ensureWaitingCard(threadId)) await trash(threadId);
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || !selected) return;
      if ((ev.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      const fromFirst = !lanes.some((l) => l.threadIds.includes(selected));
      if (ev.key === "l" && !emails[selected]?.local && !labelAsk && !fileAsk) {
        ev.preventDefault();
        setLabelAsk([selected]);
      } else if (ev.key === "#" && !emails[selected]?.local) {
        ev.preventDefault();
        void trash(selected);
      } else if ((ev.key === "f" || ev.key === "h") && fromFirst && !emails[selected]?.hidden) {
        ev.preventDefault();
        void file(selected, true);
      } else if (/^[1-9]$/.test(ev.key) && lanes[Number(ev.key) - 1]) {
        ev.preventDefault();
        if (fromFirst) openNext(selected);
        void place(selected, lanes[Number(ev.key) - 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Opening a thread on a card marks that thread seen (Gmail itself is untouched).
  const seenThread = (cardId: string, threadId: string) => {
    setEmails((prev) => {
      const e = prev[cardId];
      if (!e) return prev;
      const threads = e.threads.map((t) => (t.threadId === threadId ? { ...t, newReply: false } : t));
      return { ...prev, [cardId]: { ...e, threads, newReply: threads.some((t) => t.newReply), unread: threadId === cardId ? false : e.unread } };
    });
  };

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
        setOverLane(null);
      }}
    >
      <div className="flex h-full min-h-0 flex-col md:flex-row">
        <ColumnTabs
          view={view}
          onView={changeView}
          columns={[
            ...(view !== "lanes"
              ? [{ id: view, name: view === "list" ? "List" : view === "today" ? "Summary" : view === "tasks" ? "Tasks" : "Calendar", count: null }]
              : [...shownLanes.map((l) => ({ id: l.id, name: l.name, count: l.threadIds.length })), { id: "add", name: "+ Status", count: null }]),
          ]}
        />
        {/* On phones this row scrolls sideways, one view per screen; on desktop it dissolves. */}
        <div className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] md:contents">

        {/* Desktop: a view switch above the board. On phones it sits in the column tabs. */}
        {/* The wrapper carries the board's background on desktop; on phones it dissolves and each section carries its own. */}
        <div className="board-bg flex min-w-0 flex-1 flex-col max-md:contents">
        <div className="flex items-center gap-2 px-4 pt-3 max-md:hidden">
          <ViewSwitch view={view} onView={changeView} />
        </div>
        {view === "list" ? (
          <section
            id="col-list"
            className="animate-fade-in board-bg flex min-h-0 min-w-0 flex-1 p-4 md:bg-transparent! md:bg-none! md:shadow-none! max-md:w-[calc(100vw-1.5rem)] max-md:flex-none max-md:shrink-0 max-md:snap-start max-md:p-3"
          >
            <ListView
              labelId={sourceLabelId}
              isInbox={isInbox}
              labelName={title}
              emails={emails}
              inLens={inLens}
              inLensIds={inLensIds}
              inboxIds={firstList}
              tagOf={tagOf}
              cutoff={{ from: triageFrom, applies: cutoffApplies }}
              onShowOlder={setShowOlder}
              onClearQueue={async () => {
                const before = triageFrom;
                const at = await setTriageFrom("now");
                setTriageFromState(at);
                setShowOlder(false);
                setUndo({
                  text: "Queue cleared: only new mail shows",
                  run: async () => {
                    setUndo(null);
                    setTriageFromState(await setTriageFrom(before));
                  },
                });
              }}
              statusOf={statusOf}
              mergeEmails={mergeEmails}
              onNew={async (t) => {
                if (lens) return newCard(t, { filed: true });
                const card = await newCard(t);
                setFileAsk([card.threadId]);
                return card;
              }}
              onOpen={openAny}
              onUnfile={(id) => {
                void file(id, false);
                if (!containerOf(id, { lanes, unsorted })) setUnsorted((prev) => byDate([...prev, id]));
              }}
              onAddToBoard={addToBoardFromWaiting}
              firstLaneName={lanes[0]?.name ?? "the board"}
              onFileWaiting={fileFromWaiting}
              onTrashWaiting={trashFromWaiting}
            />
          </section>
        ) : view === "today" ? (
          <section
            id="col-today"
            className="animate-fade-in board-bg flex min-h-0 min-w-0 flex-1 p-4 md:bg-transparent! md:bg-none! md:shadow-none! max-md:w-[calc(100vw-1.5rem)] max-md:flex-none max-md:shrink-0 max-md:snap-start max-md:p-3"
          >
            <TodayView
              onBoard={shownLanes.flatMap((l) => l.threadIds.filter((t) => emails[t]).map((t) => ({ card: emails[t], status: l.name })))}
              inLensIds={inLensIds}
              ageOf={ageOf}
              toggleTask={toggleTask}
              onOpen={openAny}
              onAddToBoard={addToBoardFromWaiting}
              firstLaneName={lanes[0]?.name ?? "the board"}
              onFileWaiting={fileFromWaiting}
              onTrashWaiting={trashFromWaiting}
            />
          </section>
        ) : view === "tasks" ? (
          <section
            id="col-tasks"
            className="animate-fade-in board-bg flex min-h-0 min-w-0 flex-1 p-4 md:bg-transparent! md:bg-none! md:shadow-none! max-md:w-[calc(100vw-1.5rem)] max-md:flex-none max-md:shrink-0 max-md:snap-start max-md:p-3"
          >
            <TasksView
              onBoard={shownLanes.flatMap((l) => l.threadIds.filter((t) => emails[t]).map((t) => ({ card: emails[t], status: l.name })))}
              inLensIds={inLensIds}
              labelName={lens?.name ?? null}
              onCreate={(t, due) => newCard(t, { filed: true, task: true, ...due })}
              toggleTask={toggleTask}
              onOpen={openAny}
            />
          </section>
        ) : view === "calendar" ? (
          <section
            id="col-calendar"
            className="animate-fade-in board-bg flex min-h-0 min-w-0 flex-1 p-4 md:bg-transparent! md:bg-none! md:shadow-none! max-md:w-[calc(100vw-1.5rem)] max-md:flex-none max-md:shrink-0 max-md:snap-start max-md:overflow-y-auto max-md:p-3"
          >
            <CalendarBoard
              cardIds={[...shownLanes.flatMap((l) => l.threadIds), ...shownUnsorted]}
              emails={emails}
              statusOf={statusOf}
              onOpen={setSelected}
              onReschedule={reschedule}
              onNew={async (t, due) => void (await newCard(t, due))}
            />
          </section>
        ) : (
        <section className="animate-fade-in board-bg flex min-h-0 min-w-0 flex-1 gap-4 overflow-x-auto p-4 md:bg-transparent! md:bg-none! md:shadow-none! max-md:flex-none max-md:gap-3 max-md:overflow-visible max-md:p-3">
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
              cheer={justDone === lane.id}
              onNew={async (t) => void (await newCard(t, { laneId: lane.id }))}
              showEmptyRows={!!activeId && overLane === lane.id}
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
        )}
        </div>
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
        {activeEmail ? (
          <CardFace email={activeEmail} hideLabelId={sourceLabelId} dragging />
        ) : null}
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
      {fileAsk && <FileUnder count={fileAsk.length} onPick={(label) => fileUnder(fileAsk, label)} onClose={() => setFileAsk(null)} />}
      {labelAsk && (
        <FileUnder count={labelAsk.length} labelOnly onPick={(label) => fileUnder(labelAsk, label, false)} onClose={() => setLabelAsk(null)} />
      )}
    </DndContext>
    </CardBoardContext.Provider>
  );
}

// ---------- lanes ----------

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
  cheer,
  onNew,
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
  cheer: boolean; // a card was just dropped here and left for the List
  onNew: (title: string) => Promise<void>; // a new card with no email, in this status
  width: ReturnType<typeof useStoredWidth>;
  colors: (typeof LANE_THEMES)[number];
  icon: string;
}) {
  const [adding, setAdding] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: `${LANE}${lane.id}` });
  return (
    <div
      id={`col-${lane.id}`}
      className={`lane animate-rise relative flex max-h-full shrink-0 snap-start flex-col overflow-visible rounded-3xl shadow-[inset_0_2px_6px_rgb(80_55_25/0.08)] ring-1 transition max-md:w-[calc(100vw-1.5rem)] md:w-[var(--w)] ${colors.box} ${
        isOver ? "lane-over scale-[1.01] shadow-lg" : ""
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
          <span className="text-xs text-muted" title="Finished: cards dropped here leave the board and go to the List">
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
                ? "Finished: cards dropped here leave the board and go to the List. Click to stop."
                : "Mark as finished: cards dropped here leave the board and go to the List"
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
        {lane.finished && lane.threadIds.length === 0 &&
          (cheer ? (
            <p key="cheer" className="animate-pop rounded-2xl border-2 border-moss/50 bg-ok-bg px-3 py-4 text-center text-xs font-bold text-ok-ink">
              <span className="animate-wiggle mr-1 inline-block">✓</span> Moved to the List
            </p>
          ) : (
            <p className="rounded-2xl border-2 border-dashed border-line px-3 py-4 text-center text-xs text-muted">
              Drop a card here when it&apos;s done. It leaves the board and is kept in the List.
            </p>
          ))}
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
      <div className="px-2.5 pb-2.5">
        {adding ? (
          <NewCardForm onCreate={onNew} onClose={() => setAdding(false)} />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full rounded-xl px-2 py-1.5 text-left text-sm font-semibold text-muted transition hover:bg-cream/70 hover:text-bark"
            title="A new card with no email, in this status"
          >
            + Add a card
          </button>
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
      className={`relative touch-manipulation ${isDragging ? "opacity-30" : ""}`}
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
// Lanes (statuses side by side), Calendar (cards on the day their next action is
// due) or File (done, filed and older mail).
function ViewSwitch({ view, onView, small }: { view: BoardView; onView: (v: BoardView) => void; small?: boolean }) {
  return (
    <div role="group" aria-label="Board view" className="inline-flex shrink-0 rounded-full bg-oat p-0.5">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          onClick={() => onView(v.id)}
          aria-pressed={view === v.id}
          className={`rounded-full font-semibold whitespace-nowrap transition ${small ? "px-2.5 py-0.5 text-xs" : "px-3 py-0.5 text-sm"} ${
            view === v.id ? "bg-cream text-walnut shadow-sm" : "text-muted hover:text-bark"
          }`}
        >
          {v.name}
        </button>
      ))}
    </div>
  );
}

function ColumnTabs({
  columns,
  view,
  onView,
}: {
  columns: { id: string; name: string; count: number | null }[];
  view: BoardView;
  onView: (v: BoardView) => void;
}) {
  return (
    <nav className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line bg-cream px-2 py-1.5 [scrollbar-width:none] md:hidden" aria-label="Columns">
      <ViewSwitch view={view} onView={onView} small />
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
