// Tiny pixel-art sprites for the pixel office theme. Each sprite is a grid of
// characters; each character maps to a colour ("." is transparent). Rendered
// as crisp SVG rectangles, merging horizontal runs to keep the markup small.

const PALETTE: Record<string, string> = {
  K: "#1b1b2f", // outline
  W: "#fffdf5", // white
  G: "#d8d2c0", // light grey
  g: "#8d8a80", // mid grey
  B: "#3a86ff", // blue
  b: "#1f4fa8", // dark blue
  C: "#9be7ff", // cyan screen glint
  R: "#e04f5f", // red
  Y: "#f2c14e", // yellow
  O: "#e8833a", // orange
  L: "#5fd068", // leaf green
  D: "#2f8f3e", // dark green
  T: "#b5651d", // terracotta pot
  N: "#7a4a2a", // brown
};

const SPRITES: Record<string, string[]> = {
  envelope: [
    "KKKKKKKKKKKK",
    "KWWWWWWWWWWK",
    "KKWWWWWWWWKK",
    "KGKWWWWWWKGK",
    "KGGKKWWKKGGK",
    "KGGGGKRKGGGK",
    "KGGGGRRRGGGK",
    "KGGGGGRGGGGK",
    "KKKKKKKKKKKK",
  ],
  monitor: [
    "KKKKKKKKKKKK",
    "KGGGGGGGGGGK",
    "KGBBBBBBBBGK",
    "KGBCBBBBBBGK",
    "KGBBCBBBBBGK",
    "KGBBBBBBBBGK",
    "KGGGGGGGLGGK",
    "KKKKKKKKKKKK",
    "....KggK....",
    "..KKKKKKKK..",
  ],
  mug: [
    "..g..g......",
    "...g..g.....",
    "..g..g......",
    "KKKKKKKK....",
    "KRRRRRRKKK..",
    "KRWRRRRK.K..",
    "KRRRRRRK.K..",
    "KRRRRRRKKK..",
    "KRRRRRRK....",
    ".KKKKKK.....",
  ],
  plant: [
    "....L..L....",
    "...LDL.LL...",
    "..LDDLLDL...",
    "...LDDDL....",
    "....LDL.....",
    ".....D......",
    "...KKKKKK...",
    "...KTTTTK...",
    "...KTTTTK...",
    "....KKKK....",
  ],
  floppy: [
    "KKKKKKKKKKK.",
    "KbbGGGGGbbbK",
    "KbbGGKGGbbbK",
    "KbbGGGGGbbbK",
    "KbbbbbbbbbbK",
    "KbWWWWWWWWbK",
    "KbWKKKKKKWbK",
    "KbWWWWWWWWbK",
    "KbWKKKKKWWbK",
    "KKKKKKKKKKKK",
  ],
  folder: [
    "KKKKK.......",
    "KYYYYKKKKKK.",
    "KYYYYYYYYYYK",
    "KOOOOOOOOOOK",
    "KYYYYYYYYYYK",
    "KYYYYYYYYYYK",
    "KYYYYYYYYYYK",
    "KYYYYYYYYYYK",
    "KKKKKKKKKKKK",
  ],
  clock: [
    "...KKKKKK...",
    "..KWWWWWWK..",
    ".KWWWKWWWWK.",
    "KWWWWKWWWWWK",
    "KWWWWKWWWWWK",
    "KWWWWKKKWWWK",
    "KWWWWWWWWWWK",
    ".KWWWWWWWWK.",
    "..KWWWWWWK..",
    "...KKKKKK...",
  ],
  clipboard: [
    "....KKKK....",
    "..KKGGGGKK..",
    "..KNNNNNNK..",
    "..KWWWWWWK..",
    "..KWKKKKWK..",
    "..KWWWWWWK..",
    "..KWKKKWWK..",
    "..KWWWWWWK..",
    "..KWKKKKWK..",
    "..KKKKKKKK..",
  ],
  cactus: [
    ".....DD.....",
    "....DLLD....",
    ".D..DLLD..D.",
    "DLD.DLLD.DLD",
    "DLLDDLLDDLLD",
    ".DLLLLLLLLD.",
    "....DLLD....",
    "...KKKKKK...",
    "...KTTTTK...",
    "....KKKK....",
  ],
  lamp: [
    "...KKKKK....",
    "..KYYYYYK...",
    ".KYYYYYYYK..",
    "KKKKKKKKKKK.",
    ".....K......",
    ".....K......",
    "....K.......",
    "...K........",
    "..KKKKK.....",
    ".KgggggK....",
  ],
  plus: [
    "....KKK.....",
    "....KLK.....",
    "....KLK.....",
    "KKKKKLKKKKK.",
    "KLLLLLLLLLK.",
    "KKKKKLKKKKK.",
    "....KLK.....",
    "....KLK.....",
    "....KKK.....",
  ],
};

export function PixelSprite({ name, size = 18, className = "" }: { name: string; size?: number; className?: string }) {
  const grid = SPRITES[name] ?? SPRITES.envelope;
  const w = Math.max(...grid.map((r) => r.length));
  const h = grid.length;
  const rects: React.ReactNode[] = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      let run = 1;
      while (x + run < row.length && row[x + run] === c) run++;
      if (c !== "." && PALETTE[c]) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={run} height={1} fill={PALETTE[c]} />);
      x += run;
    }
  });
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={(size * h) / w}
      shapeRendering="crispEdges"
      className={`inline-block align-middle ${className}`}
      aria-hidden
    >
      {rects}
    </svg>
  );
}
