"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { attachEmail, fetchPickers, fileEmail } from "@/app/actions";
import type { ThreadSummary } from "@/lib/mail";
import type { CardDTO, CaseOption, FiledInfo, LaneDTO } from "@/lib/types";
import { gmailLink, senderName } from "@/lib/format";
import { Drawer, DrawerHeader } from "./Drawer";
import { ThreadView } from "./ThreadView";

type Props = {
  thread: ThreadSummary;
  filed?: FiledInfo;
  project: { id: string; name: string };
  lanes: LaneDTO[];
  onClose: () => void;
  onFiled: (card: CardDTO, info: { projectId: string; projectName: string; laneName: string }) => void;
};

// Preview of an inbox email, with the two ways to file it: new ticket, or add to an existing ticket.
export function ThreadPanel({ thread, filed, project, lanes, onClose, onFiled }: Props) {
  const [laneId, setLaneId] = useState(lanes[0]?.id ?? "");
  const [cases, setCases] = useState<CaseOption[] | null>(null);
  const [caseFilter, setCaseFilter] = useState("");

  useEffect(() => {
    void fetchPickers().then((p) => setCases(p.cases));
  }, []);

  const matches = (cases ?? [])
    .filter((c) => c.id !== filed?.cardId)
    .filter((c) => !caseFilter || `${c.title} ${c.projectName}`.toLowerCase().includes(caseFilter.toLowerCase()))
    .slice(0, 8);

  return (
    <Drawer onClose={onClose}>
      <DrawerHeader onClose={onClose}>
        <p className="mb-1 text-xs font-medium tracking-wide text-slate-400 uppercase">Email</p>
        <h2 className="text-lg font-semibold text-slate-900">{thread.subject}</h2>
        <p className="text-sm text-slate-500">
          {senderName(thread.from)} ·{" "}
          <a href={gmailLink(thread.threadId)} target="_blank" rel="noreferrer" className="hover:text-indigo-600">
            Open in Gmail ↗
          </a>
        </p>
        {filed && (
          <p className="mt-2 rounded-md bg-emerald-50 px-2 py-1 text-sm text-emerald-800">
            Filed in ticket{" "}
            <Link href={`/p/${filed.projectId}?case=${filed.cardId}`} className="font-medium underline">
              {filed.cardTitle}
            </Link>{" "}
            ({filed.projectName} › {filed.laneName})
          </p>
        )}
      </DrawerHeader>

      <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Open a new ticket</p>
          <div className="flex gap-2">
            <select value={laneId} onChange={(e) => setLaneId(e.target.value)} className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm">
              {lanes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <button
              onClick={async () => {
                const lane = lanes.find((l) => l.id === laneId);
                if (!lane) return;
                const ids = [...lane.cards.map((c) => c.id), `email:${thread.threadId}`];
                const card = await fileEmail(lane.id, thread, ids);
                onFiled(card, { projectId: project.id, projectName: project.name, laneName: lane.name });
              }}
              className="rounded-md bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-700"
            >
              {filed ? "Move ticket here" : "Create"}
            </button>
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Add to an existing ticket</p>
          <input
            value={caseFilter}
            onChange={(e) => setCaseFilter(e.target.value)}
            placeholder={cases ? `Search ${cases.length} tickets…` : "Loading tickets…"}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
          />
          {caseFilter && (
            <div className="mt-1 rounded-md border border-slate-200 bg-white">
              {matches.length === 0 && <p className="px-2 py-1 text-xs text-slate-500">No matching tickets.</p>}
              {matches.map((c) => (
                <button
                  key={c.id}
                  onClick={async () => {
                    const card = await attachEmail(c.id, thread);
                    onFiled(card, { projectId: c.projectId, projectName: c.projectName, laneName: c.laneName });
                  }}
                  className="block w-full truncate px-2 py-1 text-left text-sm hover:bg-indigo-50"
                >
                  {c.title} <span className="text-xs text-slate-400">· {c.projectName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="p-5">
        <ThreadView threadId={thread.threadId} />
      </div>
    </Drawer>
  );
}
