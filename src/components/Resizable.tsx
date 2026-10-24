"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// A width the user can drag to change, remembered per browser in localStorage.
export function useStoredWidth(key: string, initial: number, min: number, max: number) {
  const [width, setWidth] = useState(initial);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(key));
      if (saved) setWidth(clamp(saved, min, max));
    } catch {}
  }, [key, min, max]);

  const save = useCallback(
    (w: number) => {
      try {
        localStorage.setItem(key, String(w));
      } catch {}
    },
    [key],
  );

  return { width, setWidth: (w: number) => setWidth(clamp(w, min, max)), save, reset: () => (setWidth(initial), save(initial)) };
}

// A thin drag handle on the edge of a panel. `edge` is the side it sits on:
// a handle on the left edge grows the panel when dragged left.
export function ResizeHandle({
  width,
  onResize,
  onDone,
  onReset,
  edge = "right",
  label,
}: {
  width: number;
  onResize: (w: number) => void;
  onDone: (w: number) => void;
  onReset: () => void;
  edge?: "left" | "right";
  label: string;
}) {
  const drag = useRef<{ startX: number; startWidth: number; last: number } | null>(null);

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const delta = e.clientX - d.startX;
    d.last = d.startWidth + (edge === "right" ? delta : -delta);
    onResize(d.last);
  };

  const end = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    onDone(d.last);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={`${label} · drag to resize, double-click to reset`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation(); // don't start a card drag
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { startX: e.clientX, startWidth: width, last: width };
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";
      }}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onReset}
      className={`group absolute top-0 z-20 h-full w-2 cursor-col-resize max-md:hidden ${edge === "right" ? "-right-1" : "-left-1"}`}
    >
      <div className="mx-auto h-full w-0.5 bg-transparent transition-colors group-hover:bg-terracotta group-active:bg-accent-soft0" />
    </div>
  );
}

// Pass a stored width to CSS as --w, so a class can use it on larger screens
// only (md:w-[var(--w)]) while phones get a full-width layout.
export const widthVar = (px: number) => ({ "--w": `${px}px` }) as React.CSSProperties;
