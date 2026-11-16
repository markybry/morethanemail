"use client";

import { ThemeIcon, useTheme } from "./ThemeContext";

// Something is on its way: the theme's loading icon hops while the dots type out.
export function Loading({ text, className = "", big = false }: { text?: string; className?: string; big?: boolean }) {
  const { theme } = useTheme();
  const words = (text ?? theme.text.loading).replace(/(…|\.\.\.)$/, "");
  return (
    <div role="status" className={`flex items-center gap-2 text-muted ${big ? "flex-col justify-center py-16 text-base" : "p-3 text-sm"} ${className}`}>
      <ThemeIcon icon={theme.icons.loading} size={big ? 36 : 18} className={`animate-hop inline-block ${big ? "text-4xl" : ""}`} />
      <span>
        {words}
        <span className="animate-dots inline-block overflow-hidden align-bottom whitespace-nowrap" aria-hidden>
          ...
        </span>
      </span>
    </div>
  );
}
