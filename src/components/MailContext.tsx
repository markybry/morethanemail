"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchLabels, fetchPins, setPinnedLabels } from "@/app/actions";
import type { MailLabel } from "@/lib/mail";
import { makeLabelColorer } from "@/lib/labelColors";

type MailContextValue = {
  me: string; // the signed-in user's address, to tell their own messages apart
  labels: MailLabel[];
  labelNames: Map<string, string>;
  colorOfPath: (path: string) => string;
  colorOf: (labelId: string) => string | undefined;
  reloadLabels: () => void;
  pinned: string[]; // label ids pinned to the top of the sidebar
  togglePin: (labelId: string) => void;
  setPins: (labelIds: string[]) => void; // a new order
  openCount: (labelId: string) => number; // open cards carrying the label or a sub-label
  reloadPins: () => void;
  recentLabels: string[]; // label ids most recently applied, newest first
  noteLabelUsed: (labelId: string) => void;
};

const RECENT_KEY = "mte.recentLabels";

const MailContext = createContext<MailContextValue | null>(null);

// The user's Gmail labels, shared by the sidebar tree and the email cards' label chips.
export function MailProvider({ me, children }: { me: string; children: React.ReactNode }) {
  const [labels, setLabels] = useState<MailLabel[]>([]);

  const reloadLabels = useCallback(() => {
    void fetchLabels().then((r) => setLabels(r.labels));
  }, []);

  useEffect(() => reloadLabels(), [reloadLabels]);

  const labelNames = useMemo(() => new Map(labels.map((l) => [l.id, l.name])), [labels]);

  // Pinned labels, and the labels on each open card for their counts.
  const [pinned, setPinned] = useState<string[]>([]);
  const [openCards, setOpenCards] = useState<string[][]>([]);
  const reloadPins = useCallback(() => {
    void fetchPins()
      .then((r) => {
        setPinned(r.pinned);
        setOpenCards(r.open);
      })
      .catch(() => {});
  }, []);
  useEffect(() => reloadPins(), [reloadPins]);
  const togglePin = useCallback((labelId: string) => {
    setPinned((prev) => {
      const next = prev.includes(labelId) ? prev.filter((x) => x !== labelId) : [...prev, labelId];
      void setPinnedLabels(next).catch(() => setPinned(prev));
      return next;
    });
  }, []);
  const setPins = useCallback((labelIds: string[]) => {
    setPinned((prev) => {
      void setPinnedLabels(labelIds).catch(() => setPinned(prev));
      return labelIds;
    });
  }, []);
  const openCount = useCallback(
    (labelId: string) => {
      const name = labelNames.get(labelId);
      if (!name) return 0;
      const inside = (id: string) => id === labelId || !!labelNames.get(id)?.startsWith(`${name}/`);
      return openCards.filter((ids) => ids.some(inside)).length;
    },
    [labelNames, openCards],
  );
  // Labels applied lately, offered first when labelling (this browser only).
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
      if (Array.isArray(v)) setRecent(v.filter((x) => typeof x === "string"));
    } catch {}
  }, []);
  const noteLabelUsed = useCallback((labelId: string) => {
    if (!labelId.startsWith("Label_")) return;
    setRecent((prev) => {
      const next = [labelId, ...prev.filter((x) => x !== labelId)].slice(0, 12);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);
  const recentLabels = useMemo(() => recent.filter((id) => labelNames.has(id)), [recent, labelNames]);
  const colorOfPath = useMemo(() => makeLabelColorer(labels), [labels]);
  const colorOf = useCallback(
    (labelId: string) => {
      const name = labelNames.get(labelId);
      return name ? colorOfPath(name) : undefined;
    },
    [labelNames, colorOfPath],
  );

  return (
    <MailContext.Provider value={{ me, labels, labelNames, colorOfPath, colorOf, reloadLabels, pinned, togglePin, setPins, openCount, reloadPins, recentLabels, noteLabelUsed }}>
      {children}
    </MailContext.Provider>
  );
}

export function useMail() {
  const ctx = useContext(MailContext);
  if (!ctx) throw new Error("useMail must be used inside MailProvider");
  return ctx;
}
