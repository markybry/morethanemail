"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { saveTheme } from "@/app/actions";
import { THEMES, type ThemeDef, type ThemeId } from "@/lib/themes";
import { PixelSprite } from "./PixelSprite";

type ThemeContextValue = { theme: ThemeDef; setTheme: (id: ThemeId) => void };

const ThemeContext = createContext<ThemeContextValue>({ theme: THEMES.woodland, setTheme: () => {} });

// The user's chosen theme. The server renders <html data-theme=...> from the
// saved choice; switching updates the attribute at once and saves it.
export function ThemeProvider({ initial, children }: { initial: ThemeId; children: React.ReactNode }) {
  const [id, setId] = useState<ThemeId>(initial);
  const setTheme = useCallback((next: ThemeId) => {
    setId(next);
    document.documentElement.dataset.theme = next;
    void saveTheme(next);
  }, []);
  return <ThemeContext.Provider value={{ theme: THEMES[id], setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

// An icon from the current theme: an emoji, or a pixel sprite.
export function ThemeIcon({ icon, size = 18, className = "" }: { icon: string; size?: number; className?: string }) {
  if (icon.startsWith("sprite:")) return <PixelSprite name={icon.slice("sprite:".length)} size={size} className={className} />;
  return <span className={className}>{icon}</span>;
}
