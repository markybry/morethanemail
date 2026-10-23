import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { GOOGLE_SCOPES, oauthClient } from "@/lib/google";

export async function GET() {
  if (!process.env.GOOGLE_CLIENT_ID) return NextResponse.json({ error: "Google sign-in is not configured" }, { status: 500 });

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
    prompt: "consent", // always return a refresh token
    scope: GOOGLE_SCOPES,
    state,
  });
  return NextResponse.redirect(url);
}
