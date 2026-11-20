import "server-only";
import type { calendar_v3 } from "googleapis";
import type { User } from "@prisma/client";
import { calendarFor } from "./google";
import type { CalendarEvent } from "./types";

// Events on the user's primary Google Calendar.

function toEvent(e: calendar_v3.Schema$Event): CalendarEvent | null {
  const allDay = !e.start?.dateTime;
  const start = e.start?.dateTime ?? e.start?.date;
  const end = e.end?.dateTime ?? e.end?.date ?? start;
  if (!e.id || !start || !end) return null;
  return {
    eventId: e.id,
    title: e.summary || "(no title)",
    // An all-day event's date is a calendar day: keep it as that day at midnight UTC.
    start: new Date(allDay ? `${start}T00:00:00Z` : start).toISOString(),
    end: new Date(allDay ? `${end}T00:00:00Z` : end).toISOString(),
    allDay,
    htmlLink: e.htmlLink ?? "",
    attendees: (e.attendees ?? []).map((a) => (a.email ?? "").toLowerCase()).filter(Boolean),
    cancelled: e.status === "cancelled",
  };
}

// Upcoming events (and the last week's), soonest first, optionally matching text.
export async function listEvents(user: User, query: string): Promise<CalendarEvent[]> {
  if (user.isDemo) return [];
  const now = Date.now();
  const res = await calendarFor(user).events.list({
    calendarId: "primary",
    timeMin: new Date(now - 7 * 86_400_000).toISOString(),
    timeMax: new Date(now + 90 * 86_400_000).toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 100,
    q: query.trim() || undefined,
  });
  return (res.data.items ?? []).map(toEvent).filter((e): e is CalendarEvent => !!e && !e.cancelled);
}

// One event; null if it has been deleted.
export async function getEvent(user: User, eventId: string): Promise<CalendarEvent | null> {
  if (user.isDemo) return null;
  try {
    const res = await calendarFor(user).events.get({ calendarId: "primary", eventId });
    return toEvent(res.data);
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    if (code === 404 || code === 410) return null;
    throw e;
  }
}

export type NewEvent = { title: string; start: string; end: string; timeZone: string; attendees: string[]; description: string };

// Creates the event. Invitations are emailed only when there are attendees.
export async function createEvent(user: User, ev: NewEvent): Promise<CalendarEvent> {
  if (user.isDemo) throw new Error("Calendar isn't available in the demo.");
  const res = await calendarFor(user).events.insert({
    calendarId: "primary",
    sendUpdates: ev.attendees.length ? "all" : "none",
    requestBody: {
      summary: ev.title,
      description: ev.description || undefined,
      start: { dateTime: ev.start, timeZone: ev.timeZone },
      end: { dateTime: ev.end, timeZone: ev.timeZone },
      attendees: ev.attendees.map((email) => ({ email })),
    },
  });
  const out = toEvent(res.data);
  if (!out) throw new Error("Google Calendar didn't return the new event.");
  return out;
}

// Calendar failures as text the card can show.
export function calendarErrorMessage(e: unknown): string {
  const err = e as { code?: unknown; status?: number; message?: string };
  const msg = err.message ?? "";
  if (/insufficient authentication scopes|insufficientPermissions/i.test(msg) || err.code === 403 && /scope/i.test(msg))
    return "NOT_CONNECTED";
  if (/invalid_grant/i.test(msg))
    return "Your Google sign-in has expired. Sign out, then use “Reconnect it” on the sign-in page.";
  if (/has not been used|is disabled/i.test(msg))
    return "The Google Calendar API isn't enabled for this Google Cloud project. Enable it in the Google Cloud Console.";
  if (/demo/i.test(msg)) return msg;
  return "Couldn't reach Google Calendar. Try again.";
}
