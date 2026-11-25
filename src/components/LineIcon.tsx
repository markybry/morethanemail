// Clean line icons (24×24, rounded 1.75px strokes, drawn in the text colour)
// for the modern themes. A theme names one as "line:<name>".
const PATHS: Record<string, React.ReactNode> = {
  mail: (
    <>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  gauge: (
    <>
      <path d="M3.5 18.5a9.5 9.5 0 1 1 17 0" />
      <path d="m12 14 4-4.5" />
      <circle cx="12" cy="14" r="1" />
    </>
  ),
  "check-square": (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  inbox: (
    <>
      <path d="M21.5 12.5h-5.5l-1.5 2.5h-5l-1.5-2.5H2.5" />
      <path d="M5.5 5.2 2.5 12.5v5a2 2 0 0 0 2 2h15a2 2 0 0 0 2-2v-5l-3-7.3a1.5 1.5 0 0 0-1.4-.9H6.9a1.5 1.5 0 0 0-1.4.9z" />
    </>
  ),
  sparkles: (
    <>
      <path d="M11 3.5 12.8 8l4.7 1.8-4.7 1.8L11 16l-1.8-4.4L4.5 9.8 9.2 8z" />
      <path d="m18.5 14.5.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </>
  ),
  loader: <path d="M20.5 12a8.5 8.5 0 1 1-5.9-8.1" />,
  bulb: (
    <>
      <path d="M9.5 18h5M10.5 21h3" />
      <path d="M12 3a6.5 6.5 0 0 0-3.8 11.8c.5.4.8 1 .8 1.6V16h6v-.6c0-.6.3-1.2.8-1.6A6.5 6.5 0 0 0 12 3z" />
    </>
  ),
  "circle-dot": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4.5h12l-2.2 4 2.2 4H5" />
    </>
  ),
  send: (
    <>
      <path d="M21 3 10.5 13.5" />
      <path d="M21 3 14.5 21l-4-7.5L3 9.5z" />
    </>
  ),
  archive: (
    <>
      <rect x="2.5" y="3.5" width="19" height="5" rx="1.5" />
      <path d="M4.5 8.5v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-10" />
      <path d="M10 12.5h4" />
    </>
  ),
  "check-circle": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  folder: <path d="M3.5 7.5a2 2 0 0 1 2-2h3.8l2 2.2h7.2a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M8.5 7V5.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2V7" />
      <path d="M3 12.5h18" />
    </>
  ),
  home: (
    <>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9v11h13V9" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" />,
  heart: <path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z" />,
  tag: (
    <>
      <path d="M3.5 3.5h8l9 9-8 8-9-9z" />
      <circle cx="8" cy="8" r="1.5" />
    </>
  ),
  book: (
    <>
      <path d="M4.5 19V5.5a2 2 0 0 1 2-2h13v14h-13a2 2 0 0 0-2 2 2 2 0 0 0 2 2h13" />
      <path d="M9 7.5h6" />
    </>
  ),
  bolt: <path d="M13 2.5 4.5 13.5h7l-1 8 8.5-11h-7z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5s1.1-6.1 3.5-8.5z" />
    </>
  ),
  leaf: (
    <>
      <path d="M11 20.5c-4 0-6.5-3-6.5-7 0-6 5.5-9.5 15-9.5 0 9.5-3.5 16.5-8.5 16.5z" />
      <path d="M4.5 20.5c2.5-4.5 6-8 10.5-10.5" />
    </>
  ),
};

export const LINE_ICONS = Object.keys(PATHS);

export function LineIcon({ name, size = 18, className = "" }: { name: string; size?: number; className?: string }) {
  const body = PATHS[name] ?? PATHS["circle-dot"];
  return (
    <svg
      // In rem, so icons grow with the UI size setting.
      width={`${size / 16}rem`}
      height={`${size / 16}rem`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`inline-block shrink-0 align-[-0.15em] ${className}`}
    >
      {body}
    </svg>
  );
}
