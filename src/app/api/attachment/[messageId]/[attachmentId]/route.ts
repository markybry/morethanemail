import { NextRequest, NextResponse } from "next/server";
import { gmailFor } from "@/lib/google";
import { mailErrorMessage } from "@/lib/mail";
import { SAFE_IMAGE } from "@/lib/mime";
import { getCurrentUser } from "@/lib/session";

// An email attachment, fetched from Gmail for the signed-in user. Embedded
// images in email HTML point here. Only plain image types are shown inline;
// everything else (SVG included, since it can carry script) downloads.
export async function GET(req: NextRequest, { params }: { params: Promise<{ messageId: string; attachmentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.isDemo) return NextResponse.json({ error: "No attachments in demo mode" }, { status: 404 });

  const { messageId, attachmentId } = await params;
  let data: string | null | undefined;
  try {
    const res = await gmailFor(user).users.messages.attachments.get({ userId: "me", messageId, id: attachmentId });
    data = res.data.data;
  } catch (e) {
    console.error("attachment fetch failed", e);
    return NextResponse.json({ error: mailErrorMessage(e) }, { status: 502 });
  }
  if (!data) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  const type = req.nextUrl.searchParams.get("type") ?? "";
  const name = req.nextUrl.searchParams.get("name") || "attachment";
  const inline = SAFE_IMAGE.test(type);
  return new NextResponse(Buffer.from(data, "base64url"), {
    headers: {
      "Content-Type": inline ? type : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'",
    },
  });
}
