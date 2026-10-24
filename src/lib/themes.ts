// Visual themes. Colours, fonts and textures live in globals.css under
// [data-theme=...]; this file holds the names and the icons each theme uses.
// An icon is an emoji, or "sprite:<name>" for the pixel-art sprites.

export type ThemeId = "woodland" | "georgian" | "pixel";

export type ThemeIcons = {
  logo: string;
  tasks: string;
  addLane: string;
  empty: string;
  sorted: string;
  loading: string;
  hint: string;
  lanes: string[];
  labels: string[];
};

export type ThemeDef = {
  id: ThemeId;
  name: string;
  icons: ThemeIcons;
  text: { sorted: string; empty: string; loading: string };
};

export const THEMES: Record<ThemeId, ThemeDef> = {
  woodland: {
    id: "woodland",
    name: "🦊 Woodland",
    icons: {
      logo: "🦊",
      tasks: "🐝",
      addLane: "🌱",
      empty: "🦔",
      sorted: "🦉",
      loading: "🐢",
      hint: "🐿️",
      lanes: ["🦔", "🦊", "🐝", "🦉", "🐻", "🐢"],
      labels: ["🦊", "🦔", "🦉", "🐻", "🐢", "🐇", "🦡", "🐿️", "🦫", "🐸"],
    },
    text: { sorted: "All sorted. Time for a cuppa.", empty: "Nothing with this label yet.", loading: "Fetching your mail…" },
  },
  georgian: {
    id: "georgian",
    name: "🖋️ Georgian writing desk",
    icons: {
      logo: "🖋️",
      tasks: "📜",
      addLane: "🪶",
      empty: "🕯️",
      sorted: "🫖",
      loading: "⌛",
      hint: "🪶",
      lanes: ["🪶", "📜", "🕯️", "🗝️", "📚", "⌛"],
      labels: ["📜", "🗝️", "🕯️", "📚", "🪶", "⌛", "🧭", "🔖", "🏺", "🖋️"],
    },
    text: {
      sorted: "All correspondence answered. Tea, perhaps?",
      empty: "No letters under this seal.",
      loading: "Fetching the post…",
    },
  },
  pixel: {
    id: "pixel",
    name: "👾 Pixel office",
    icons: {
      logo: "sprite:envelope",
      tasks: "sprite:clipboard",
      addLane: "sprite:plus",
      empty: "sprite:cactus",
      sorted: "sprite:mug",
      loading: "sprite:clock",
      hint: "sprite:monitor",
      lanes: ["sprite:monitor", "sprite:mug", "sprite:plant", "sprite:floppy", "sprite:folder", "sprite:clock"],
      labels: [
        "sprite:folder",
        "sprite:floppy",
        "sprite:monitor",
        "sprite:plant",
        "sprite:mug",
        "sprite:clipboard",
        "sprite:cactus",
        "sprite:clock",
        "sprite:envelope",
        "sprite:lamp",
      ],
    },
    text: { sorted: "INBOX CLEAR! +100 XP", empty: "NO FILES FOUND", loading: "LOADING..." },
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export const isThemeId = (v: unknown): v is ThemeId => typeof v === "string" && v in THEMES;
