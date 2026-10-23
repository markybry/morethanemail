import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { db } from "@/lib/db";
import { appUrl, oauthClient } from "@/lib/google";
import { isEmailAllowed, setSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const jar = await cookies();
  const expectedState = jar.get("mte_oauth_state")?.value;
  jar.delete("mte_oauth_state");

  const fail = (reason: string) => NextResponse.redirect(`${appUrl()}/?error=${encodeURIComponent(reason)}`);
  if (!code || !state || state !== expectedState) return fail("Sign-in failed, please try again.");

  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const { data: profile } = await google.oauth2({ version: "v2", auth: client }).userinfo.get();
  if (!profile.email) return fail("Google did not return an email address.");
  if (!isEmailAllowed(profile.email)) return fail(`${profile.email} is not allowed to use this app.`);

  const tokenData = {
    accessToken: tokens.access_token ?? null,
    tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    // Google only sends a refresh token on consent; keep the old one otherwise.
    ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
  };
  const user = await db.user.upsert({
    where: { email: profile.email },
    create: { email: profile.email, name: profile.name, picture: profile.picture, ...tokenData },
    update: { name: profile.name, picture: profile.picture, ...tokenData },
  });

  await setSession(user.id);
  return NextResponse.redirect(`${appUrl()}/`);
}
