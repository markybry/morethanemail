"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchLabels, fetchPins, setPinnedLabels } from "@/app/actions";
import type { MailLabel } from "@/lib/mail";
import { makeLabelColorer } from "@/lib/labelColors";

type MailContextValue = {
  labels: MailLabel[];
  labelNames: Map<string, string>;
  colorOfPath: (path: string) => string;
  colorOf: (labelId: string) => string | undefined;
  reloadLabels: () => void;
  pinned: string[]; // label ids pinned to the top of the sidebar
  togglePin: (labelId: string) => void;
  openCount: (labelId: string) => number; // open cards carrying the label or a sub-label
  reloadPins: () => void;
};

const MailContext = createContext<MailContextValue | null>(null);

// The user's Gmail labels, shared by the sidebar tree and the email cards' label chips.
export function MailProvider({ children }: { children: React.ReactNode }) {
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
  const openCount = useCallback(
    (labelId: string) => {
      const name = labelNames.get(labelId);
      if (!name) return 0;
      const inside = (id: string) => id === labelId || !!labelNames.get(id)?.startsWith(`${name}/`);
      return openCards.filter((ids) => ids.some(inside)).length;
    },
    [labelNames, openCards],
  );
  const colorOfPath = useMemo(() => makeLabelColorer(labels), [labels]);
  const colorOf = useCallback(
    (labelId: string) => {
      const name = labelNames.get(labelId);
      return name ? colorOfPath(name) : undefined;
    },
    [labelNames, colorOfPath],
  );

  return (
    <MailContext.Provider value={{ labels, labelNames, colorOfPath, colorOf, reloadLabels, pinned, togglePin, openCount, reloadPins }}>
      {children}
    </MailContext.Provider>
  );
}

export function useMail() {
  const ctx = useContext(MailContext);
  if (!ctx) throw new Error("useMail must be used inside MailProvider");
  return ctx;
}
