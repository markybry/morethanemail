"use client";

import { useEffect, useRef, useState } from "react";
import { fetchThread } from "@/app/actions";
import type { MessageDetail, ThreadDetail } from "@/lib/mail";
import { senderName } from "@/lib/format";
import type { Attachment } from "@/lib/mime";

// Loads and renders a thread. To keep long threads readable, older messages
// fold to one line (the newest stays open) and each message's quoted copy of
// earlier ones is hidden behind "show quoted text". HTML bodies go into a
// sandboxed iframe with scripts disabled, so email content can't run code.
export function ThreadView({ threadId, onLoaded }: { threadId: string; onLoaded?: () => void }) {
  const [thread, setThread] = useState<ThreadDetail | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
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
          const last = res.thread?.messages[res.thread.messages.length - 1];
          setOpen(new Set(last ? [last.id] : []));
          onLoadedRef.current?.();
        }
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Could not load email"));
    return () => {
      live = false;
    };
  }, [threadId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (thread === undefined) return <p className="text-sm text-muted">Loading email…</p>;
  if (thread === null) return <p className="text-sm text-muted">This email is no longer available.</p>;

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allOpen = thread.messages.every((m) => open.has(m.id));

  return (
    <div className="space-y-2">
      {thread.messages.length > 2 && (
        <button
          onClick={() => setOpen(allOpen ? new Set([thread.messages[thread.messages.length - 1].id]) : new Set(thread.messages.map((m) => m.id)))}
          className="text-xs font-semibold text-muted hover:text-terracotta"
        >
          {allOpen ? "Fold older messages" : `Open all ${thread.messages.length} messages`}
        </button>
      )}
      {thread.messages.map((m) => (
        <article key={m.id} className="rounded-lg border border-line">
          <button
            onClick={() => toggle(m.id)}
            className={`block w-full px-3 py-2 text-left text-xs text-muted ${open.has(m.id) ? "border-b border-line" : "hover:bg-oat"}`}
            aria-expanded={open.has(m.id)}
          >
            <span className="flex gap-2">
              <span className="min-w-0 flex-1 truncate font-medium text-bark" title={m.from}>
                {senderName(m.from)}
              </span>
              <span className="shrink-0">{new Date(m.date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
            </span>
            {/* Folded: the first few lines of what this message says, so most can be read without opening. */}
            {!open.has(m.id) && <span className="mt-1 line-clamp-3 text-sm leading-snug text-ink">{preview(m)}</span>}
          </button>
          {open.has(m.id) && (
            <>
              {m.html ? <HtmlBody html={m.html} /> : <TextBody text={m.text ?? "(no content)"} />}
              {m.attachments.length > 0 && <Attachments items={m.attachments} />}
            </>
          )}
        </article>
      ))}
    </div>
  );
}

// The first words of a message's own text, for its folded line.
function preview(m: MessageDetail) {
  const text = m.text ?? (m.html ?? "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  return ownText(text).replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
}

// Where the quoted copy of earlier messages starts in a plain-text reply.
const QUOTE_START = [
  /^>/,
  /^On .{4,}wrote:\s*$/i,
  /^-{2,}\s*Original Message\s*-{2,}/i,
  /^_{5,}\s*$/,
  /^From:\s.+/i,
];

function ownText(text: string) {
  const lines = text.split(/\r?\n/);
  const cut = lines.findIndex((l, i) => i > 0 && QUOTE_START.some((r) => r.test(l.trim())));
  return cut > 0 ? lines.slice(0, cut).join("\n").trimEnd() : text;
}

function TextBody({ text }: { text: string }) {
  const [showQuoted, setShowQuoted] = useState(false);
  const own = ownText(text);
  const hasQuote = own.length < text.trimEnd().length;
  return (
    <div className="px-3 py-2">
      <pre className="font-sans text-sm whitespace-pre-wrap text-walnut">{showQuoted ? text : own}</pre>
      {hasQuote && <QuoteToggle shown={showQuoted} onToggle={() => setShowQuoted((v) => !v)} />}
    </div>
  );
}

function QuoteToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="mt-1 rounded-md bg-oat px-2 py-0.5 text-xs font-semibold text-bark hover:text-terracotta"
      title={shown ? "Hide the quoted earlier messages" : "Show the quoted earlier messages"}
    >
      {shown ? "Hide quoted text" : "··· show quoted text"}
    </button>
  );
}

// Elements that hold the quoted copy of earlier messages, by mail program. For
// the ones marked "and after", everything that follows is the quote too.
const QUOTE_SELECTORS = [".gmail_quote", ".gmail_extra", "blockquote[type=cite]", ".yahoo_quoted", ".moz-cite-prefix", ".protonmail_quote"];
const QUOTE_AND_AFTER = ["#divRplyFwdMsg", "#appendonsend", "hr#stopSpelling", "div[style*='border-top:solid #E1E1E1']", "div[style*='border-top: solid #E1E1E1']", "div[style*='border-top:solid #B5C4DF']"];

function HtmlBody({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const quoted = useRef<HTMLElement[]>([]);
  const [height, setHeight] = useState(200);
  const [hasQuote, setHasQuote] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);
  const doc = `<!doctype html><html><head><base target="_blank"><meta charset="utf-8"><style>body{margin:12px;font:14px/1.5 system-ui,sans-serif;color:#1e293b;word-wrap:break-word}img{max-width:100%;height:auto}.mte-quoted{display:none!important}</style></head><body>${html}</body></html>`;

  const measure = () => {
    const h = ref.current?.contentDocument?.documentElement.scrollHeight;
    if (h) setHeight(Math.min(h + 4, 4000));
  };

  // Find the quoted part once the email has loaded, and hide it.
  const findQuote = () => {
    const d = ref.current?.contentDocument;
    if (!d) return;
    const found = new Set<HTMLElement>();
    d.querySelectorAll<HTMLElement>(QUOTE_SELECTORS.join(",")).forEach((el) => found.add(el));
    d.querySelectorAll<HTMLElement>(QUOTE_AND_AFTER.join(",")).forEach((el) => {
      // The marker may sit inside a wrapper; hide from the marker's top-level block onward.
      let start: HTMLElement = el;
      while (start.parentElement && start.parentElement !== d.body && !start.previousElementSibling) start = start.parentElement;
      for (let n: Element | null = start; n; n = n.nextElementSibling) if (n instanceof HTMLElement) found.add(n);
    });
    let list = [...found].filter((el) => el !== d.body);
    list.forEach((el) => el.classList.add("mte-quoted"));
    // Never hide the whole message: if nothing would be left, show it all.
    if (!d.body.innerText.trim()) {
      list.forEach((el) => el.classList.remove("mte-quoted"));
      list = [];
    }
    quoted.current = list;
    setHasQuote(list.length > 0);
    setShowQuoted(false);
    measure();
  };

  const toggle = () => {
    const show = !showQuoted;
    quoted.current.forEach((el) => el.classList.toggle("mte-quoted", !show));
    setShowQuoted(show);
    requestAnimationFrame(measure);
  };

  return (
    <>
      <iframe
        ref={ref}
        // allow-same-origin (without allow-scripts) lets the app measure the content and fold the quoted part.
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={doc}
        onLoad={findQuote}
        style={{ height }}
        className="w-full"
        title="Email content"
      />
      {hasQuote && (
        <div className="px-3 pb-2">
          <QuoteToggle shown={showQuoted} onToggle={toggle} />
        </div>
      )}
    </>
  );
}

// Attachments not embedded in the email body: images as thumbnails, the rest as downloads.
function Attachments({ items }: { items: Attachment[] }) {
  const images = items.filter((a) => a.isImage);
  const files = items.filter((a) => !a.isImage);
  return (
    <div className="space-y-2 border-t border-line px-3 py-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a) => (
            <a key={a.url} href={a.url} target="_blank" rel="noreferrer" title={a.filename} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element -- authenticated attachment URL, not optimisable */}
              <img src={a.url} alt={a.filename} className="h-28 max-w-[14rem] rounded border border-line object-cover" />
            </a>
          ))}
        </div>
      )}
      {files.map((a) => (
        <a
          key={a.url}
          href={a.url}
          className="flex items-center gap-2 rounded px-1 py-0.5 text-sm text-bark hover:bg-oat hover:text-terracotta"
        >
          <span aria-hidden>📎</span>
          <span className="min-w-0 flex-1 truncate">{a.filename}</span>
          <span className="shrink-0 text-xs text-muted">{formatSize(a.size)}</span>
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
