"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchLabels } from "@/app/actions";
import type { MailLabel, MailView } from "@/lib/mail";

const VIEW_KEY = "mte.inboxView";

type MailContextValue = {
  view: MailView;
  setView: (v: MailView) => void;
  labels: MailLabel[];
  reloadLabels: () => void;
  ready: boolean; // the saved view has been read, so the inbox can load
};

const MailContext = createContext<MailContextValue | null>(null);

// Shares the open mailbox view between the sidebar's label tree and the
// inbox column on the board. The view is a per-browser convenience in localStorage.
export function MailProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [view, setViewState] = useState<MailView>("primary");
  const [labels, setLabels] = useState<MailLabel[]>([]);
  const [ready, setReady] = useState(false);

  const reloadLabels = useCallback(() => {
    void fetchLabels().then((r) => setLabels(r.labels));
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY) as MailView | null;
      if (saved) setViewState(saved);
    } catch {}
    setReady(true);
    reloadLabels();
  }, [reloadLabels]);

  const setView = useCallback(
    (v: MailView) => {
      setViewState(v);
      try {
        localStorage.setItem(VIEW_KEY, v);
      } catch {}
      // The inbox lives on workspace boards; from elsewhere, go to one.
      if (!pathname.startsWith("/p/")) router.push("/");
    },
    [pathname, router],
  );

  return <MailContext.Provider value={{ view, setView, labels, reloadLabels, ready }}>{children}</MailContext.Provider>;
}

export function useMail() {
  const ctx = useContext(MailContext);
  if (!ctx) throw new Error("useMail must be used inside MailProvider");
  return ctx;
}

export function viewTitle(view: MailView, labels: MailLabel[]) {
  if (view === "primary") return "Inbox";
  if (view === "inbox") return "Inbox · all tabs";
  if (view === "unread") return "Unread";
  const id = view.slice("label:".length);
  return labels.find((l) => l.id === id)?.name.split("/").join(" › ") ?? "Label";
}
