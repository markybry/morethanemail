"use client";

import { useEffect } from "react";

export function Drawer({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/20" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white shadow-2xl">{children}</div>
    </div>
  );
}

export function DrawerHeader({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-slate-200 bg-white px-5 py-4">
      <div className="min-w-0 flex-1">{children}</div>
      <button onClick={onClose} className="rounded px-2 text-xl leading-none text-slate-400 hover:bg-slate-100" title="Close (Esc)">
        ×
      </button>
    </div>
  );
}
