import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isDemoAvailable, setSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  if (!isDemoAvailable()) return NextResponse.json({ error: "Demo mode is disabled" }, { status: 403 });
  const user = await db.user.upsert({
    where: { email: "demo@morethanemail.local" },
    create: { email: "demo@morethanemail.local", name: "Demo User", isDemo: true },
    update: {},
  });
  await setSession(user.id);
  return NextResponse.redirect(new URL("/", req.url), { status: 303 });
}
