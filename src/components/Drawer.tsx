"use client";

import { useEffect } from "react";
import { ResizeHandle, useStoredWidth } from "./Resizable";

export function Drawer({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const w = useStoredWidth("mte.w.panel", 672, 360, 1600);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="animate-fade-in absolute inset-0 bg-[#2b221b]/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="paper animate-slide-in relative h-full max-w-[calc(100vw-3rem)] shadow-2xl shadow-[#2b221b]/40"
        style={{ width: w.width }}
      >
        <ResizeHandle width={w.width} onResize={w.setWidth} onDone={w.save} onReset={w.reset} edge="left" label="Resize panel" />
        <div className="flex h-full flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function DrawerHeader({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-dashed border-[#d9c9ad] bg-cream px-5 py-4">
      <div className="min-w-0 flex-1">{children}</div>
      <button
        onClick={onClose}
        className="rounded-full px-2 text-xl leading-none text-[#a8957a] transition hover:rotate-90 hover:bg-oat hover:text-terracotta"
        title="Close (Esc)"
      >
        ×
      </button>
    </div>
  );
}
