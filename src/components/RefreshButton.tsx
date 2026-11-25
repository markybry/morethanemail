"use client";

import { useState } from "react";
import { resyncMail } from "@/app/actions";
import { clearAll } from "@/lib/clientCache";

// Resync with Gmail: forget everything kept (in the browser and on the server)
// and load the page afresh. For when something looks out of date. Lives in the
// top bar beside search, so it's there on every page.
export function RefreshButton({ className = "" }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        clearAll();
        try {
          await resyncMail();
        } catch {}
        window.location.reload();
      }}
      className={`btn-press inline-flex shrink-0 items-center gap-1.5 rounded-full bg-oat px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-bark hover:text-terracotta disabled:opacity-60 ${className}`}
      title="Something out of date? Fetch everything from Gmail again"
      aria-label="Refresh from Gmail"
    >
      <span className={`glyph ${busy ? "animate-spin" : ""}`} aria-hidden>
        ⟳
      </span>
      <span className="max-md:hidden">{busy ? "Refreshing…" : "Refresh"}</span>
    </button>
  );
}
