// "Sarah Chen <sarah@acme.co>" -> "Sarah Chen"
export function senderName(from: string) {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<.+>\s*$/);
  return (m?.[1] || from.replace(/[<>]/g, "")).trim() || "(unknown)";
}

export function shortDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

// "Today", "Tomorrow", "3 Dec", with the time when one was set: "Today 14:30".
export function dueLabel(iso: string, withTime = false) {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  const date =
    diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday" : d.toLocaleDateString([], { day: "numeric", month: "short" });
  return withTime ? `${date} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : date;
}

// Past due: past the time when one was set, otherwise once the day is over.
export function isOverdue(iso: string, withTime = false) {
  const d = new Date(iso);
  if (!withTime) d.setHours(23, 59, 59, 999);
  return d.getTime() < Date.now();
}

// "just now", "5m ago", "3h ago", "2d ago", then the date.
export function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ago`;
  if (mins < 7 * 24 * 60) return `${Math.floor(mins / 1440)}d ago`;
  return shortDate(iso);
}

// Tickets made in the app with no email behind them.
export const LOCAL_PREFIX = "local:";
export const isLocalThread = (threadId: string) => threadId.startsWith(LOCAL_PREFIX);

export const gmailLink = (threadId: string) => `https://mail.google.com/mail/u/0/#all/${threadId}`;
