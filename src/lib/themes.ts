// Visual themes. Colours, fonts and textures live in globals.css under
// [data-theme=...]; this file holds the names and the icons each theme uses.
// An icon is an emoji, or "sprite:<name>" for the pixel-art sprites.

export type ThemeId = "woodland" | "beach" | "georgian" | "pixel" | "studio" | "dev" | "dark" | "light";

export type ThemeIcons = {
  logo: string;
  workspace: string; // the whole board
  dashboard: string;
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
      workspace: "🌳",
      dashboard: "🏡",
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
  // Sand, sea glass and coral; a deep-sea sidebar.
  beach: {
    id: "beach",
    name: "🏖️ Beach",
    icons: {
      logo: "🐚",
      workspace: "🌊",
      dashboard: "🌅",
      tasks: "🦀",
      addLane: "🐚",
      empty: "🦀",
      sorted: "🍹",
      loading: "🌊",
      hint: "🐚",
      lanes: ["🐚", "🦀", "🐠", "🌊", "⛱️", "🪸"],
      labels: ["🐚", "🦀", "🐠", "🐬", "🪸", "⛱️", "🌴", "🐢", "⭐", "🦩"],
    },
    text: { sorted: "All clear. Feet up, tide's out.", empty: "Nothing washed up here yet.", loading: "Waiting for the tide…" },
  },
  georgian: {
    id: "georgian",
    name: "🖋️ Georgian writing desk",
    icons: {
      logo: "🖋️",
      workspace: "🗄️",
      dashboard: "🧭",
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
      workspace: "sprite:folder",
      dashboard: "sprite:monitor",
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
  // Modern and calm: off-white, one indigo accent, soft shadows, line icons.
  studio: {
    id: "studio",
    name: "◇ Studio",
    icons: {
      logo: "line:mail",
      workspace: "line:grid",
      dashboard: "line:gauge",
      tasks: "line:check-square",
      addLane: "line:plus",
      empty: "line:inbox",
      sorted: "line:sparkles",
      loading: "line:loader",
      hint: "line:bulb",
      lanes: ["line:circle-dot", "line:clock", "line:flag", "line:send", "line:archive", "line:check-circle"],
      labels: ["line:folder", "line:briefcase", "line:home", "line:star", "line:heart", "line:tag", "line:book", "line:bolt", "line:globe", "line:leaf"],
    },
    text: { sorted: "Inbox zero. Nicely done.", empty: "Nothing with this label yet.", loading: "Syncing your mail…" },
  },
  // Plain and dense, like an issue tracker: easy to scan, no decoration.
  dev: {
    id: "dev",
    name: "⌨️ Dev (compact)",
    icons: {
      logo: "▣",
      workspace: "▤",
      dashboard: "◫",
      tasks: "☑",
      addLane: "+",
      empty: "∅",
      sorted: "✓",
      loading: "…",
      hint: "›",
      lanes: ["●", "●", "●", "●", "●", "●"],
      labels: ["#", "#", "#", "#", "#", "#", "#", "#", "#", "#"],
    },
    text: { sorted: "0 unsorted. All triaged.", empty: "No threads with this label.", loading: "Loading threads…" },
  },
  // Clean and clear on a dark background: simple shapes, no decoration.
  dark: {
    id: "dark",
    name: "🌙 Dark",
    icons: {
      logo: "◆",
      workspace: "▤",
      dashboard: "◧",
      tasks: "☑",
      addLane: "+",
      empty: "○",
      sorted: "✓",
      loading: "…",
      hint: "›",
      lanes: ["●", "●", "●", "●", "●", "●"],
      labels: ["●", "●", "●", "●", "●", "●", "●", "●", "●", "●"],
    },
    text: { sorted: "All clear.", empty: "Nothing here yet.", loading: "Loading…" },
  },
  // The bright twin of Dark.
  light: {
    id: "light",
    name: "☀️ Light",
    icons: {
      logo: "◆",
      workspace: "▤",
      dashboard: "◧",
      tasks: "☑",
      addLane: "+",
      empty: "○",
      sorted: "✓",
      loading: "…",
      hint: "›",
      lanes: ["●", "●", "●", "●", "●", "●"],
      labels: ["●", "●", "●", "●", "●", "●", "●", "●", "●", "●"],
    },
    text: { sorted: "All clear.", empty: "Nothing here yet.", loading: "Loading…" },
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export const isThemeId = (v: unknown): v is ThemeId => typeof v === "string" && v in THEMES;
