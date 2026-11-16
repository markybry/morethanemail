import type { MailLabel } from "./mail";

// One icon per top-level label (from the theme's list), so each branch has its own face.
export function makeLabelIcon(labels: MailLabel[], icons: string[]) {
  const tops = [...new Set(labels.map((l) => l.name.split("/")[0]))].sort((a, b) => a.localeCompare(b));
  const byTop = new Map(tops.map((t, i) => [t, icons[i % icons.length]]));
  return (path: string) => byTop.get(path.split("/")[0]) ?? icons[0];
}

// A stable number from a label's name, so its colour never changes when other labels come and go.
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hslToHex(h: number, s: number, l: number) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Colours for every label, assigned automatically. Each top-level label gets a
// hue of its own; a sub-label is a shade of its parent (a nearby hue, a little
// lighter or darker), so a client and its projects read as one family but each
// project can still be told apart. Soft, earthy tones that read on the sidebar,
// on cards and in the dark themes. A colour set on the label in Gmail wins, for
// that label and the ones under it.
export function makeLabelColorer(labels: MailLabel[]) {
  const byName = new Map(labels.map((l) => [l.name, l]));
  const cache = new Map<string, { h: number; s: number; l: number }>();

  const tone = (path: string): { h: number; s: number; l: number } => {
    const hit = cache.get(path);
    if (hit) return hit;
    const parts = path.split("/");
    const n = hash(path);
    let t;
    if (parts.length === 1) {
      t = { h: n % 360, s: 42 + (n >> 9) % 18, l: 56 + (n >> 17) % 8 };
    } else {
      const parent = tone(parts.slice(0, -1).join("/"));
      t = { h: (parent.h + ((n % 61) - 30) + 360) % 360, s: parent.s, l: Math.max(46, Math.min(70, parent.l + ((n >> 8) % 17) - 8)) };
    }
    cache.set(path, t);
    return t;
  };

  // Works for any path, including parents that aren't labels themselves.
  return (path: string) => {
    const parts = path.split("/");
    for (let i = parts.length; i >= 1; i--) {
      const own = byName.get(parts.slice(0, i).join("/"))?.color;
      if (own) return own;
    }
    const t = tone(path);
    return hslToHex(t.h, t.s, t.l);
  };
}
