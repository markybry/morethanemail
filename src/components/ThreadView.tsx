"use client";

import { useEffect, useRef, useState } from "react";
import { fetchThread } from "@/app/actions";
import type { ThreadDetail } from "@/lib/mail";
import { senderName } from "@/lib/format";
import type { Attachment } from "@/lib/mime";

// Loads and renders every message in a thread. HTML bodies go into a sandboxed
// iframe with scripts disabled, so email content can't run code in the app.
export function ThreadView({ threadId, onLoaded }: { threadId: string; onLoaded?: () => void }) {
  const [thread, setThread] = useState<ThreadDetail | null | undefined>(undefined);
  const [error, setError] = useState("");
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  });

  useEffect(() => {
    let live = true;
    fetchThread(threadId)
      .then((res) => {
        if (!live) return;
        if (res.error) setError(res.error);
        else {
          setThread(res.thread);
          onLoadedRef.current?.();
        }
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Could not load email"));
    return () => {
      live = false;
    };
  }, [threadId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (thread === undefined) return <p className="text-sm text-slate-500">Loading email…</p>;
  if (thread === null) return <p className="text-sm text-slate-500">This email is no longer available.</p>;

  return (
    <div className="space-y-3">
      {thread.messages.map((m) => (
        <article key={m.id} className="rounded-lg border border-slate-200">
          <header className="flex gap-2 border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
            <span className="min-w-0 flex-1 truncate font-medium text-slate-700" title={m.from}>
              {senderName(m.from)}
            </span>
            <span className="shrink-0">{new Date(m.date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
          </header>
          {m.html ? (
            <HtmlBody html={m.html} />
          ) : (
            <pre className="px-3 py-2 font-sans text-sm whitespace-pre-wrap text-slate-800">{m.text ?? "(no content)"}</pre>
          )}
          {m.attachments.length > 0 && <Attachments items={m.attachments} />}
        </article>
      ))}
    </div>
  );
}

function HtmlBody({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);
  const doc = `<!doctype html><html><head><base target="_blank"><meta charset="utf-8"><style>body{margin:12px;font:14px/1.5 system-ui,sans-serif;color:#1e293b;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
  return (
    <iframe
      ref={ref}
      // allow-same-origin (without allow-scripts) only lets us measure the content height.
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      onLoad={() => {
        const h = ref.current?.contentDocument?.documentElement.scrollHeight;
        if (h) setHeight(Math.min(h + 4, 4000));
      }}
      style={{ height }}
      className="w-full"
      title="Email content"
    />
  );
}

// Attachments not embedded in the email body: images as thumbnails, the rest as downloads.
function Attachments({ items }: { items: Attachment[] }) {
  const images = items.filter((a) => a.isImage);
  const files = items.filter((a) => !a.isImage);
  return (
    <div className="space-y-2 border-t border-slate-100 px-3 py-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a) => (
            <a key={a.url} href={a.url} target="_blank" rel="noreferrer" title={a.filename} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element -- authenticated attachment URL, not optimisable */}
              <img src={a.url} alt={a.filename} className="h-28 max-w-[14rem] rounded border border-slate-200 object-cover" />
            </a>
          ))}
        </div>
      )}
      {files.map((a) => (
        <a
          key={a.url}
          href={a.url}
          className="flex items-center gap-2 rounded px-1 py-0.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-700"
        >
          <span aria-hidden>📎</span>
          <span className="min-w-0 flex-1 truncate">{a.filename}</span>
          <span className="shrink-0 text-xs text-slate-400">{formatSize(a.size)}</span>
        </a>
      ))}
    </div>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
