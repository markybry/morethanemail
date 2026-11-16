"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { saveTheme } from "@/app/actions";
import { THEMES, type ThemeDef, type ThemeId } from "@/lib/themes";
import { PixelSprite } from "./PixelSprite";

// How much a card shows on the board: compact (title and markers) or detailed
// (summary, latest activity, all next actions). Saved on this device.
export type Density = "compact" | "detailed";
const DENSITY_KEY = "mte.density";
// The theme also goes in a cookie, so the sign-in and error pages (no user yet) match it.
export const THEME_COOKIE = "mte.theme";
const rememberTheme = (id: ThemeId) => {
  document.cookie = `${THEME_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`;
};

// Animation: always on, follow the device's reduce-motion setting, or off.
export type Motion = "on" | "system" | "off";
const MOTION_COOKIE = "mte.motion";
const isMotion = (v: unknown): v is Motion => v === "on" || v === "system" || v === "off";

type ThemeContextValue = {
  theme: ThemeDef;
  setTheme: (id: ThemeId) => void;
  density: Density;
  setDensity: (d: Density) => void;
  motion: Motion;
  setMotion: (m: Motion) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: THEMES.woodland,
  setTheme: () => {},
  density: "compact",
  setDensity: () => {},
  motion: "on",
  setMotion: () => {},
});

// The user's chosen theme. The server renders <html data-theme=...> from the
// saved choice; switching updates the attribute at once and saves it.
export function ThemeProvider({ initial, children }: { initial: ThemeId; children: React.ReactNode }) {
  const [id, setId] = useState<ThemeId>(initial);
  const setTheme = useCallback((next: ThemeId) => {
    setId(next);
    document.documentElement.dataset.theme = next;
    rememberTheme(next);
    void saveTheme(next);
  }, []);
  useEffect(() => rememberTheme(initial), [initial]);
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
  const [motion, setMotionState] = useState<Motion>("on");
  useEffect(() => {
    const m = document.documentElement.dataset.motion;
    if (isMotion(m)) setMotionState(m);
  }, []);
  const setMotion = useCallback((m: Motion) => {
    setMotionState(m);
    document.documentElement.dataset.motion = m;
    document.cookie = `${MOTION_COOKIE}=${m}; path=/; max-age=31536000; samesite=lax`;
  }, []);
  return (
    <ThemeContext.Provider value={{ theme: THEMES[id], setTheme, density, setDensity, motion, setMotion }}>{children}</ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

// An icon from the current theme: an emoji, or a pixel sprite.
export function ThemeIcon({ icon, size = 18, className = "" }: { icon: string; size?: number; className?: string }) {
  if (icon.startsWith("sprite:")) return <PixelSprite name={icon.slice("sprite:".length)} size={size} className={className} />;
  return <span className={className}>{icon}</span>;
}
