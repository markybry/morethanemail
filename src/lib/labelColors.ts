import type { MailLabel } from "./mail";

// Earthy woodland colours that read on the walnut sidebar and as dots on cream cards.
const PALETTE = ["#d98a5a", "#9cb36b", "#e3b64f", "#7fa2b8", "#c97d76", "#b3a173", "#8fb5a0", "#c9a27a", "#a58fb8", "#d6c27a"];

// One animal per top-level label, so each branch has a friendly face.
const ANIMALS = ["🦊", "🦔", "🦉", "🐻", "🐢", "🐇", "🦡", "🐿️", "🦫", "🐸"];

export function makeLabelAnimal(labels: MailLabel[]) {
  const tops = [...new Set(labels.map((l) => l.name.split("/")[0]))].sort((a, b) => a.localeCompare(b));
  const byTop = new Map(tops.map((t, i) => [t, ANIMALS[i % ANIMALS.length]]));
  return (path: string) => byTop.get(path.split("/")[0]) ?? "🦊";
}

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
