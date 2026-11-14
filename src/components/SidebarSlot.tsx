"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";

// A spot at the bottom of the sidebar that a page can fill (the board puts its
// Inbox / To-triage column there). It's a portal, so the content stays in the
// page's React tree: drag-and-drop and context keep working across the gap.
const SlotContext = createContext<HTMLElement | null>(null);
export const SidebarSlotProvider = SlotContext.Provider;

function useDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

// Renders children in the sidebar slot on desktop; in place on phones, where
// the sidebar is a slide-in menu.
export function InSidebar({ children }: { children: (docked: boolean) => React.ReactNode }) {
  const slot = useContext(SlotContext);
  const desktop = useDesktop();
  if (slot && desktop) return createPortal(children(true), slot);
  return <>{children(false)}</>;
}
