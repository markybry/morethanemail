"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { fetchInbox, fileEmail, moveCards } from "@/app/actions";
import type { ThreadSummary } from "@/lib/mail";
import type { CardDTO, FiledInfo, LaneDTO, ProjectDTO } from "@/lib/types";
import { Inbox, EmailRowPreview } from "./Inbox";
import { Board } from "./Board";
import { CardFace } from "./CardFace";
import { CasePanel } from "./CasePanel";
import { ThreadPanel } from "./ThreadPanel";

export type Selection = { kind: "card"; cardId: string } | { kind: "thread"; thread: ThreadSummary } | null;

const EMAIL_PREFIX = "email:";
const LANE_PREFIX = "lane:";

export function Workspace({ project, initialCaseId }: { project: ProjectDTO; initialCaseId?: string }) {
  const router = useRouter();
  const [lanes, setLanes] = useState<LaneDTO[]>(project.lanes);
  const [selection, setSelection] = useState<Selection>(initialCaseId ? { kind: "card", cardId: initialCaseId } : null);

  // Server refreshes (after actions that revalidate) replace local state.
  useEffect(() => setLanes(project.lanes), [project]);

  // ----- inbox -----
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [filed, setFiled] = useState<Record<string, FiledInfo>>({});
  const [query, setQuery] = useState("");
  const [nextPage, setNextPage] = useState<string | undefined>();
  const [inboxState, setInboxState] = useState<"idle" | "loading" | "error">("loading");
  const [inboxError, setInboxError] = useState("");

  const loadInbox = useCallback(async (q: string, pageToken?: string) => {
    setInboxState("loading");
    try {
      const res = await fetchInbox(q, pageToken);
      setThreads((prev) => (pageToken ? [...prev, ...res.threads] : res.threads));
      setFiled((prev) => (pageToken ? { ...prev, ...res.filed } : res.filed));
      setNextPage(res.nextPageToken);
      setInboxState("idle");
    } catch (e) {
      setInboxError(e instanceof Error ? e.message : "Could not load email");
      setInboxState("error");
    }
  }, []);

  useEffect(() => {
    void loadInbox("");
  }, [loadInbox]);

  const markFiled = useCallback(
    (card: CardDTO, laneName: string, projectId = project.id, projectName = project.name) => {
      setFiled((prev) => {
        const next = { ...prev };
        for (const e of card.emails)
          next[e.threadId] = { cardId: card.id, cardTitle: card.title, projectId, projectName, laneName };
        return next;
      });
    },
    [project.id, project.name],
  );

  // ----- board helpers -----
  const cardById = useMemo(() => {
    const m = new Map<string, CardDTO>();
    lanes.forEach((l) => l.cards.forEach((c) => m.set(c.id, c)));
    return m;
  }, [lanes]);

  const replaceCard = useCallback((card: CardDTO) => {
    setLanes((prev) => {
      const without = prev.map((l) => ({ ...l, cards: l.cards.filter((c) => c.id !== card.id) }));
      const old = prev.find((l) => l.cards.some((c) => c.id === card.id));
      return without.map((l) => {
        if (l.id !== card.laneId) return l;
        if (old?.id === l.id) return { ...l, cards: old.cards.map((c) => (c.id === card.id ? card : c)) };
        return { ...l, cards: [...l.cards, card] };
      });
    });
  }, []);

  // Keep inbox "filed in" labels in step with cards dragged around this board.
  const inboxFiled = useMemo(() => {
    const laneOfCard = new Map<string, string>();
    lanes.forEach((l) => l.cards.forEach((c) => laneOfCard.set(c.id, l.name)));
    const out: Record<string, FiledInfo> = {};
    for (const [threadId, f] of Object.entries(filed)) {
      const laneName = f.projectId === project.id ? laneOfCard.get(f.cardId) : undefined;
      out[threadId] = laneName ? { ...f, laneName } : f;
    }
    return out;
  }, [filed, lanes, project.id]);

  const dropCard = useCallback((cardId: string) => {
    setLanes((prev) => prev.map((l) => ({ ...l, cards: l.cards.filter((c) => c.id !== cardId) })));
  }, []);

  // ----- drag and drop -----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const snapshot = useRef<{ lanes: LaneDTO[]; fromLane?: string } | null>(null);

  const laneOf = (id: string, ls: LaneDTO[]) =>
    id.startsWith(LANE_PREFIX) ? id.slice(LANE_PREFIX.length) : ls.find((l) => l.cards.some((c) => c.id === id))?.id;

  const collision: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    const cardHits = hits.filter((h) => !String(h.id).startsWith(LANE_PREFIX));
    if (cardHits.length) return cardHits;
    if (hits.length) return hits;
    return closestCorners(args);
  };

  function onDragStart({ active }: DragStartEvent) {
    const id = String(active.id);
    setActiveId(id);
    snapshot.current = { lanes, fromLane: laneOf(id, lanes) };
  }

  // Cards follow the pointer across lanes while dragging.
  function onDragOver({ active, over }: DragOverEvent) {
    const id = String(active.id);
    if (!over || id.startsWith(EMAIL_PREFIX)) return;
    const overId = String(over.id);
    setLanes((prev) => {
      const from = laneOf(id, prev);
      const to = laneOf(overId, prev);
      if (!from || !to || from === to) return prev;
      const card = prev.find((l) => l.id === from)!.cards.find((c) => c.id === id)!;
      return prev.map((l) => {
        if (l.id === from) return { ...l, cards: l.cards.filter((c) => c.id !== id) };
        if (l.id !== to) return l;
        const idx = overId.startsWith(LANE_PREFIX) ? l.cards.length : l.cards.findIndex((c) => c.id === overId);
        const cards = [...l.cards];
        cards.splice(idx < 0 ? cards.length : idx, 0, { ...card, laneId: to });
        return { ...l, cards };
      });
    });
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    const id = String(active.id);
    setActiveId(null);
    const snap = snapshot.current;
    snapshot.current = null;
    if (!over) {
      if (snap) setLanes(snap.lanes);
      return;
    }
    const overId = String(over.id);
    if (id.startsWith(EMAIL_PREFIX)) return dropEmail(id.slice(EMAIL_PREFIX.length), overId);

    const laneId = laneOf(id, lanes);
    if (!laneId) return;
    let next = lanes;
    const lane = lanes.find((l) => l.id === laneId)!;
    const oldIdx = lane.cards.findIndex((c) => c.id === id);
    const newIdx = lane.cards.findIndex((c) => c.id === overId);
    if (newIdx >= 0 && oldIdx !== newIdx) {
      next = lanes.map((l) => (l.id === laneId ? { ...l, cards: arrayMove(l.cards, oldIdx, newIdx) } : l));
      setLanes(next);
    }
    const affected = [...new Set([snap?.fromLane, laneId].filter(Boolean) as string[])];
    await moveCards(affected.map((lid) => ({ laneId: lid, cardIds: next.find((l) => l.id === lid)!.cards.map((c) => c.id) })));
  }

  async function dropEmail(threadId: string, overId: string) {
    const thread = threads.find((t) => t.threadId === threadId);
    const laneId = laneOf(overId, lanes);
    if (!thread || !laneId) return;
    const existingId = filed[threadId]?.cardId;
    const existing = existingId ? cardById.get(existingId) : undefined;
    const placeholderId = `${EMAIL_PREFIX}${threadId}`;
    const placeholder: CardDTO = existing
      ? { ...existing, id: placeholderId, laneId }
      : {
          id: placeholderId,
          laneId,
          title: thread.subject,
          emails: [{ id: placeholderId, threadId, subject: thread.subject, from: thread.from, snippet: thread.snippet, emailDate: thread.date }],
          notes: [],
          tasks: [],
        };
    const next = lanes
      .map((l) => ({ ...l, cards: l.cards.filter((c) => c.id !== existingId) }))
      .map((l) => {
        if (l.id !== laneId) return l;
        const idx = overId.startsWith(LANE_PREFIX) ? l.cards.length : l.cards.findIndex((c) => c.id === overId);
        const cards = [...l.cards];
        cards.splice(idx < 0 ? cards.length : idx, 0, placeholder);
        return { ...l, cards };
      });
    setLanes(next);
    const card = await fileEmail(laneId, thread, next.find((l) => l.id === laneId)!.cards.map((c) => c.id));
    setLanes((prev) => prev.map((l) => ({ ...l, cards: l.cards.map((c) => (c.id === placeholderId ? card : c)) })));
    markFiled(card, next.find((l) => l.id === laneId)!.name);
  }

  const activeCard = activeId && !activeId.startsWith(EMAIL_PREFIX) ? cardById.get(activeId) : undefined;
  const activeThread = activeId?.startsWith(EMAIL_PREFIX)
    ? threads.find((t) => `${EMAIL_PREFIX}${t.threadId}` === activeId)
    : undefined;
  const selectedCard = selection?.kind === "card" ? cardById.get(selection.cardId) : undefined;

  return (
    <DndContext
      id="workspace" // stable id avoids an SSR/client hydration mismatch in dnd-kit's aria ids
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        if (snapshot.current) setLanes(snapshot.current.lanes);
        snapshot.current = null;
        setActiveId(null);
      }}
    >
      <div className="flex h-full min-h-0">
        <Inbox
          threads={threads}
          filed={inboxFiled}
          query={query}
          state={inboxState}
          error={inboxError}
          hasMore={!!nextPage}
          selectedThreadId={selection?.kind === "thread" ? selection.thread.threadId : undefined}
          onQueryChange={setQuery}
          onSearch={() => loadInbox(query)}
          onLoadMore={() => loadInbox(query, nextPage)}
          onOpen={(thread) => {
            const f = filed[thread.threadId];
            if (f && f.projectId === project.id) setSelection({ kind: "card", cardId: f.cardId });
            else setSelection({ kind: "thread", thread });
          }}
        />
        <Board
          project={project}
          lanes={lanes}
          setLanes={setLanes}
          onOpenCard={(cardId) => setSelection({ kind: "card", cardId })}
        />
      </div>

      <DragOverlay dropAnimation={null}>
        {activeCard ? <CardFace card={activeCard} dragging /> : null}
        {activeThread ? <EmailRowPreview thread={activeThread} /> : null}
      </DragOverlay>

      {selectedCard && (
        <CasePanel
          key={selectedCard.id}
          card={selectedCard}
          project={project}
          lanes={lanes}
          inbox={threads}
          onClose={() => setSelection(null)}
          onChange={(card) => {
            replaceCard(card);
            markFiled(card, lanes.find((l) => l.id === card.laneId)?.name ?? "");
          }}
          onRemoved={(cardId) => {
            dropCard(cardId);
            setSelection(null);
          }}
          onMovedAway={(cardId, info) => {
            dropCard(cardId);
            setSelection(null);
            if (info) router.push(`/p/${info.projectId}?case=${cardId}`);
          }}
          onSplit={(from, created) => {
            replaceCard(from);
            replaceCard(created);
            markFiled(created, lanes.find((l) => l.id === created.laneId)?.name ?? "");
          }}
        />
      )}

      {selection?.kind === "thread" && (
        <ThreadPanel
          key={selection.thread.threadId}
          thread={selection.thread}
          filed={filed[selection.thread.threadId]}
          project={project}
          lanes={lanes}
          onClose={() => setSelection(null)}
          onFiled={(card, info) => {
            if (info.projectId === project.id) {
              replaceCard(card);
              setSelection({ kind: "card", cardId: card.id });
            } else setSelection(null);
            markFiled(card, info.laneName, info.projectId, info.projectName);
          }}
        />
      )}
    </DndContext>
  );
}
