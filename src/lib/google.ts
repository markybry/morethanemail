import "server-only";
import { google } from "googleapis";
import type { User } from "@prisma/client";
import { db } from "./db";

// gmail.modify reads mail and changes labels (and archiving, which is removing INBOX).
// It can't delete mail permanently.
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

// Read and change events on the user's calendars (to link and create meetings).
// Optional: without it the app works, and Meetings asks to connect.
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export const GOOGLE_SCOPES = ["openid", "email", "profile", GMAIL_SCOPE, CALENDAR_SCOPE];

export function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${appUrl()}/api/auth/google/callback`,
  );
}

// A Gmail call and a Calendar call can refresh the same stale token at the same
// time. Queue the writes per user, and skip a save whose starting access token
// is no longer in the DB: the slower call must not replace a newer token (or a
// refresh token that a re-consent just rotated). The DB check also covers
// separate server instances, which don't share this queue.
type Refreshed = { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null };
const pendingWrites = new Map<string, Promise<void>>();

function saveTokens(userId: string, tokens: Refreshed, startedWith: string | null) {
  if (!tokens.access_token) return;
  const write = (pendingWrites.get(userId) ?? Promise.resolve())
    .then(async () => {
      const current = await db.user.findUnique({ where: { id: userId }, select: { accessToken: true } });
      if (!current || current.accessToken !== startedWith) return; // already saved by a newer call
      await db.user.update({
        where: { id: userId },
        data: {
          accessToken: tokens.access_token ?? undefined,
          refreshToken: tokens.refresh_token ?? undefined,
          tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        },
      });
    })
    .catch((e) => console.error("Couldn't save refreshed Google token", e));
  pendingWrites.set(userId, write);
  void write.then(() => {
    if (pendingWrites.get(userId) === write) pendingWrites.delete(userId);
  });
}

// An authorized Google client for a user. Refreshed tokens are written back to the DB.
function authFor(user: User) {
  const auth = oauthClient();
  auth.setCredentials({
    access_token: user.accessToken ?? undefined,
    refresh_token: user.refreshToken ?? undefined,
    expiry_date: user.tokenExpiry?.getTime(),
  });
  const startedWith = user.accessToken;
  auth.on("tokens", (tokens) => saveTokens(user.id, tokens, startedWith));
  return auth;
}

export const gmailFor = (user: User) => google.gmail({ version: "v1", auth: authFor(user) });
export const calendarFor = (user: User) => google.calendar({ version: "v3", auth: authFor(user) });
