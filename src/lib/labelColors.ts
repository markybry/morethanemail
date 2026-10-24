import type { MailLabel } from "./mail";

// Bright enough to read on the dark sidebar and as dots on white cards.
const PALETTE = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#f87171", "#22d3ee", "#fb923c", "#a3e635", "#e879f9"];

// Colours for the label tree: each top-level branch gets its own colour and
// everything under it inherits it, so nested labels read as one family. A
// colour set on the label in Gmail wins, for that label and its children.
export function makeLabelColorer(labels: MailLabel[]) {
  const byName = new Map(labels.map((l) => [l.name, l]));
  const tops = [...new Set(labels.map((l) => l.name.split("/")[0]))].sort((a, b) => a.localeCompare(b));
  const topColor = new Map(tops.map((t, i) => [t, PALETTE[i % PALETTE.length]]));

  // Works for any path, including parents that aren't labels themselves.
  return (path: string) => {
    const parts = path.split("/");
    let color = topColor.get(parts[0]) ?? PALETTE[0];
    for (let i = 1; i <= parts.length; i++) {
      const own = byName.get(parts.slice(0, i).join("/"))?.color;
      if (own) color = own;
    }
    return color;
  };
}
