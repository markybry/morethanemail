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

export function dueLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function isOverdue(iso: string) {
  const d = new Date(iso);
  d.setHours(23, 59, 59, 999);
  return d.getTime() < Date.now();
}

// Value for <input type="date"> from an ISO string, and back.
export const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
export const fromDateInput = (v: string) => (v ? new Date(`${v}T12:00:00`).toISOString() : null);

// Tickets made in the app with no email behind them.
export const LOCAL_PREFIX = "local:";
export const isLocalThread = (threadId: string) => threadId.startsWith(LOCAL_PREFIX);

export const gmailLink = (threadId: string) => `https://mail.google.com/mail/u/0/#all/${threadId}`;
