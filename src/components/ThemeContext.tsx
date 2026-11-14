"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { saveTheme } from "@/app/actions";
import { THEMES, type ThemeDef, type ThemeId } from "@/lib/themes";
import { PixelSprite } from "./PixelSprite";

// How much a card shows on the board: compact (title and markers) or detailed
// (summary, latest activity, all next actions). Saved on this device.
export type Density = "compact" | "detailed";
const DENSITY_KEY = "mte.density";

type ThemeContextValue = { theme: ThemeDef; setTheme: (id: ThemeId) => void; density: Density; setDensity: (d: Density) => void };

const ThemeContext = createContext<ThemeContextValue>({
  theme: THEMES.woodland,
  setTheme: () => {},
  density: "compact",
  setDensity: () => {},
});

// The user's chosen theme. The server renders <html data-theme=...> from the
// saved choice; switching updates the attribute at once and saves it.
export function ThemeProvider({ initial, children }: { initial: ThemeId; children: React.ReactNode }) {
  const [id, setId] = useState<ThemeId>(initial);
  const setTheme = useCallback((next: ThemeId) => {
    setId(next);
    document.documentElement.dataset.theme = next;
    void saveTheme(next);
  }, []);
  const [density, setDensityState] = useState<Density>("compact");
  useEffect(() => {
    try {
      if (localStorage.getItem(DENSITY_KEY) === "detailed") setDensityState("detailed");
    } catch {}
  }, []);
  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    try {
      localStorage.setItem(DENSITY_KEY, d);
    } catch {}
  }, []);
  return <ThemeContext.Provider value={{ theme: THEMES[id], setTheme, density, setDensity }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

// An icon from the current theme: an emoji, or a pixel sprite.
export function ThemeIcon({ icon, size = 18, className = "" }: { icon: string; size?: number; className?: string }) {
  if (icon.startsWith("sprite:")) return <PixelSprite name={icon.slice("sprite:".length)} size={size} className={className} />;
  return <span className={className}>{icon}</span>;
}
