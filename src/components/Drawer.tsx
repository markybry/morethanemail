"use client";

import { useEffect } from "react";
import { ResizeHandle, useStoredWidth, widthVar } from "./Resizable";

export function Drawer({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const w = useStoredWidth("mte.w.panel", 760, 420, 1600);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // Centred over the board (full screen on phones), on the card surface colour so
    // the sections and emails read cleanly in every theme.
    <div className="fixed inset-0 z-40 flex items-center justify-center md:p-6">
      <div className="animate-fade-in absolute inset-0 bg-shadow/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="animate-rise relative flex h-full flex-col bg-cream shadow-2xl shadow-shadow/40 max-md:w-full md:h-[calc(100vh-3rem)] md:max-h-[60rem] md:w-[var(--w)] md:max-w-[calc(100vw-3rem)] md:overflow-hidden md:rounded-3xl md:border md:border-line"
        style={widthVar(w.width)}
      >
        <ResizeHandle width={w.width} onResize={w.setWidth} onDone={w.save} onReset={w.reset} edge="right" label="Resize card" />
        <div className="flex h-full flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function DrawerHeader({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-dashed border-line-strong bg-cream px-5 py-4">
      <div className="min-w-0 flex-1">{children}</div>
      <button
        onClick={onClose}
        className="rounded-full px-2 text-xl leading-none text-muted transition hover:rotate-90 hover:bg-oat hover:text-terracotta"
        title="Close (Esc)"
      >
        ×
      </button>
    </div>
  );
}
