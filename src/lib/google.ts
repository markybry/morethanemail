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

// An authorized Google client for a user. Refreshed tokens are written back to the DB.
function authFor(user: User) {
  const auth = oauthClient();
  auth.setCredentials({
    access_token: user.accessToken ?? undefined,
    refresh_token: user.refreshToken ?? undefined,
    expiry_date: user.tokenExpiry?.getTime(),
  });
  auth.on("tokens", (tokens) => {
    void db.user.update({
      where: { id: user.id },
      data: {
        accessToken: tokens.access_token ?? undefined,
        refreshToken: tokens.refresh_token ?? undefined,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      },
    });
  });
  return auth;
}

export const gmailFor = (user: User) => google.gmail({ version: "v1", auth: authFor(user) });
export const calendarFor = (user: User) => google.calendar({ version: "v3", auth: authFor(user) });
