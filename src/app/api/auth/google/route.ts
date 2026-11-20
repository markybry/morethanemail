import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { GOOGLE_SCOPES, oauthClient } from "@/lib/google";

export async function GET(req: NextRequest) {
  if (!process.env.GOOGLE_CLIENT_ID) return NextResponse.json({ error: "Google sign-in is not configured" }, { status: 500 });

  // Forcing consent on every sign-in mints a new refresh token each time, and
  // Google can invalidate the older one — disconnecting other sessions. Normal
  // sign-ins reuse the existing grant and keep the stored refresh token. Only
  // the Calendar upgrade and an explicit reconnect ask for the screen once.
  const forceConsent =
    req.nextUrl.searchParams.get("connect") === "calendar" || req.nextUrl.searchParams.get("reconnect") === "1";

  const state = randomBytes(16).toString("hex");
  (await cookies()).set("mte_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  const url = oauthClient().generateAuthUrl({
    access_type: "offline",
    ...(forceConsent ? { prompt: "consent" } : {}),
    scope: GOOGLE_SCOPES,
    state,
  });
  return NextResponse.redirect(url);
}
