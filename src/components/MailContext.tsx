"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchLabels } from "@/app/actions";
import type { MailLabel } from "@/lib/mail";
import { makeLabelColorer } from "@/lib/labelColors";

type MailContextValue = {
  labels: MailLabel[];
  labelNames: Map<string, string>;
  colorOfPath: (path: string) => string;
  colorOf: (labelId: string) => string | undefined;
  reloadLabels: () => void;
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
  const colorOfPath = useMemo(() => makeLabelColorer(labels), [labels]);
  const colorOf = useCallback(
    (labelId: string) => {
      const name = labelNames.get(labelId);
      return name ? colorOfPath(name) : undefined;
    },
    [labelNames, colorOfPath],
  );

  return (
    <MailContext.Provider value={{ labels, labelNames, colorOfPath, colorOf, reloadLabels }}>{children}</MailContext.Provider>
  );
}

export function useMail() {
  const ctx = useContext(MailContext);
  if (!ctx) throw new Error("useMail must be used inside MailProvider");
  return ctx;
}
