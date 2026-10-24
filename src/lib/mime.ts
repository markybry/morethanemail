import type { gmail_v1 } from "googleapis";

export type Attachment = {
  filename: string;
  mimeType: string;
  size: number; // bytes
  url: string; // served by /api/attachment, or a data: URL for tiny inline parts
  isImage: boolean;
};

// Images a browser can show safely. SVG is left out: it can carry script.
export const SAFE_IMAGE = /^image\/(png|jpe?g|gif|webp|bmp|avif)$/i;

const partHeader = (p: gmail_v1.Schema$MessagePart, name: string) =>
  p.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

export const attachmentUrl = (messageId: string, attachmentId: string, mimeType: string, filename: string) =>
  `/api/attachment/${encodeURIComponent(messageId)}/${encodeURIComponent(attachmentId)}?type=${encodeURIComponent(
    mimeType,
  )}&name=${encodeURIComponent(filename)}`;

// Pull the bodies and attachments out of a Gmail message. Images embedded in
// the HTML (src="cid:...") are pointed at the attachment endpoint, so they
// show inline; everything not embedded is listed as an attachment.
export function parseMessageParts(
  messageId: string,
  payload: gmail_v1.Schema$MessagePart | undefined,
): { html: string | null; text: string | null; attachments: Attachment[] } {
  let html: string | null = null;
  let text: string | null = null;
  const files: (Attachment & { cid: string })[] = [];

  const walk = (p: gmail_v1.Schema$MessagePart | undefined) => {
    if (!p) return;
    const mimeType = p.mimeType ?? "application/octet-stream";
    const cid = partHeader(p, "Content-ID").replace(/^<|>$/g, "");
    const isFile = !!p.filename || !!p.body?.attachmentId || (!!cid && !mimeType.startsWith("text/"));
    if (isFile) {
      const filename = p.filename || `${cid || "attachment"}`;
      const url = p.body?.attachmentId
        ? attachmentUrl(messageId, p.body.attachmentId, mimeType, filename)
        : `data:${mimeType};base64,${Buffer.from(p.body?.data ?? "", "base64url").toString("base64")}`;
      files.push({ filename, mimeType, size: p.body?.size ?? 0, url, isImage: SAFE_IMAGE.test(mimeType), cid });
    } else if (p.body?.data) {
      const decoded = Buffer.from(p.body.data, "base64url").toString("utf8");
      if (mimeType === "text/html" && html === null) html = decoded;
      if (mimeType === "text/plain" && text === null) text = decoded;
    }
    p.parts?.forEach(walk);
  };
  walk(payload);

  // Point cid: references at the parts they name; those parts aren't listed again.
  const embedded = new Set<string>();
  if (html !== null) {
    html = (html as string).replace(/cid:([^"'\s)>]+)/gi, (match, ref: string) => {
      const file = files.find((f) => f.cid && f.cid === decodeURIComponent(ref));
      if (!file) return match;
      embedded.add(file.cid);
      return file.url;
    });
  }
  const attachments = files
    .filter((f) => !f.cid || !embedded.has(f.cid))
    .map((f) => ({ filename: f.filename, mimeType: f.mimeType, size: f.size, url: f.url, isImage: f.isImage }));
  return { html, text, attachments };
}
