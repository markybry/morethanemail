"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createCase, createLane, deleteLane, deleteProject, renameLane, renameProject, reorderLanes } from "@/app/actions";
import type { CardDTO, LaneDTO, ProjectDTO } from "@/lib/types";
import { CardFace } from "./CardFace";
import { ConfirmButton, InlineEdit } from "./ui";

type Props = {
  project: ProjectDTO;
  lanes: LaneDTO[];
  setLanes: Dispatch<SetStateAction<LaneDTO[]>>;
  newReplyCardIds: Set<string>;
  onOpenCard: (cardId: string) => void;
};

export function Board({ project, lanes, setLanes, newReplyCardIds, onOpenCard }: Props) {
  const router = useRouter();
  const [newLane, setNewLane] = useState("");

  async function moveLane(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= lanes.length) return;
    const next = [...lanes];
    [next[index], next[target]] = [next[target], next[index]];
    setLanes(next);
    await reorderLanes(project.id, next.map((l) => l.id));
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-slate-100">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: project.color }} />
        <div className="min-w-0 flex-1">
          <InlineEdit
            value={project.name}
            onSave={(name) => renameProject(project.id, name)}
            className="text-lg font-semibold text-slate-900"
          />
          {project.origin && (
            <p className="text-xs text-slate-500">
              Grew from case{" "}
              <button className="text-indigo-600 hover:underline" onClick={() => onOpenCard(project.origin!.cardId)}>
                {project.origin.title}
              </button>
            </p>
          )}
        </div>
        <ConfirmButton
          label="Delete project"
          confirmLabel="Delete project and all its cases?"
          onConfirm={async () => {
            await deleteProject(project.id);
            router.push("/");
          }}
        />
      </header>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
        {lanes.map((lane, i) => (
          <Lane
            key={lane.id}
            lane={lane}
            isFirst={i === 0}
            isLast={i === lanes.length - 1}
            onMove={(dir) => moveLane(i, dir)}
            onRename={async (name) => {
              setLanes((prev) => prev.map((l) => (l.id === lane.id ? { ...l, name } : l)));
              await renameLane(lane.id, name);
            }}
            onDelete={async () => {
              setLanes((prev) => prev.filter((l) => l.id !== lane.id));
              await deleteLane(lane.id);
            }}
            onAddCase={async (title) => {
              const card = await createCase(lane.id, title);
              setLanes((prev) => prev.map((l) => (l.id === lane.id ? { ...l, cards: [...l.cards, card] } : l)));
              onOpenCard(card.id);
            }}
            newReplyCardIds={newReplyCardIds}
            onOpenCard={onOpenCard}
          />
        ))}
        <form
          className="w-64 shrink-0"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newLane.trim()) return;
            const lane = await createLane(project.id, newLane);
            setLanes((prev) => [...prev, lane]);
            setNewLane("");
          }}
        >
          <input
            value={newLane}
            onChange={(e) => setNewLane(e.target.value)}
            placeholder="+ Add lane"
            className="w-full rounded-lg border border-dashed border-slate-300 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-500 focus:bg-white"
          />
        </form>
      </div>
    </section>
  );
}

type LaneProps = {
  lane: LaneDTO;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dir: -1 | 1) => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onAddCase: (title: string) => Promise<void>;
  newReplyCardIds: Set<string>;
  onOpenCard: (cardId: string) => void;
};

function Lane({ lane, isFirst, isLast, onMove, onRename, onDelete, onAddCase, newReplyCardIds, onOpenCard }: LaneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane:${lane.id}` });
  const [adding, setAdding] = useState("");

  return (
    <div className="flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-slate-200/70">
      <div className="group flex items-center gap-1 px-3 pt-2.5 pb-1">
        <InlineEdit value={lane.name} onSave={onRename} className="text-sm font-semibold text-slate-700" />
        <span className="text-xs text-slate-500">{lane.cards.length}</span>
        <div className="ml-auto flex items-center opacity-0 transition group-hover:opacity-100">
          <button disabled={isFirst} onClick={() => onMove(-1)} className="px-1 text-slate-500 disabled:opacity-30" title="Move left">
            ‹
          </button>
          <button disabled={isLast} onClick={() => onMove(1)} className="px-1 text-slate-500 disabled:opacity-30" title="Move right">
            ›
          </button>
          <ConfirmButton label="✕" confirmLabel="Delete lane?" onConfirm={onDelete} small />
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 ${isOver ? "rounded-lg bg-indigo-100/60" : ""}`}
      >
        <SortableContext items={lane.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {lane.cards.map((card) => (
            <SortableCard key={card.id} card={card} newReply={newReplyCardIds.has(card.id)} onOpen={() => onOpenCard(card.id)} />
          ))}
        </SortableContext>
      </div>
      <form
        className="px-2 pb-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!adding.trim()) return;
          const title = adding;
          setAdding("");
          await onAddCase(title);
        }}
      >
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder="+ New case"
          className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-slate-500 focus:bg-white"
        />
      </form>
    </div>
  );
}

function SortableCard({ card, newReply, onOpen }: { card: CardDTO; newReply: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={isDragging ? "opacity-30" : ""}
    >
      <CardFace card={card} newReply={newReply} />
    </div>
  );
}
