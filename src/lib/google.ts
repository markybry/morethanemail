import "server-only";
import { google } from "googleapis";
import type { User } from "@prisma/client";
import { db } from "./db";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export const GOOGLE_SCOPES = ["openid", "email", "profile", GMAIL_SCOPE];

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

// An authorized Gmail client for a user. Refreshed tokens are written back to the DB.
export function gmailFor(user: User) {
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
  return google.gmail({ version: "v1", auth });
}
