"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createWorkspace } from "@/app/actions";
import type { MailLabel } from "@/lib/mail";
import { useMail } from "./MailContext";
import { ThemeIcon, useTheme } from "./ThemeContext";
import { makeLabelIcon } from "@/lib/labelColors";

type Node = { segment: string; path: string; label?: MailLabel; children: Node[] };

// Gmail nests labels by name ("Clients/Acme"), so the tree is built from the names.
// A parent that isn't itself a label still shows, but only opens its level.
function buildTree(labels: MailLabel[]): Node[] {
  const root: Node = { segment: "", path: "", children: [] };
  for (const l of labels) {
    const parts = l.name.split("/");
    let cur = root;
    parts.forEach((segment, i) => {
      const path = parts.slice(0, i + 1).join("/");
      let child = cur.children.find((c) => c.path === path);
      if (!child) {
        child = { segment, path, children: [] };
        cur.children.push(child);
      }
      if (i === parts.length - 1) child.label = l;
      cur = child;
    });
  }
  return root.children;
}

function findNode(nodes: Node[], path: string): Node | undefined {
  for (const n of nodes) {
    if (n.path === path) return n;
    if (path.startsWith(`${n.path}/`)) return findNode(n.children, path);
  }
}

const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const lastOf = (path: string) => path.split("/").pop() ?? path;
const hrefFor = (labelId: string) => `/l/${encodeURIComponent(labelId)}`;

// The workflow first, then the user's labels one level at a time: a label with
// sub-labels has a › that steps into them, and the heading steps back out.
// A label is a lens: opening it shows the workflow filtered to that label.
export function MailNav() {
  const { theme } = useTheme();
  const { labels, reloadLabels, pinned, togglePin, openCount, reloadPins, colorOf } = useMail();
  const pathname = usePathname();
  // Counts change as cards move; refresh them when moving between pages.
  useEffect(() => reloadPins(), [pathname, reloadPins]);
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [filter, setFilter] = useState("");
  const tree = useMemo(() => buildTree(labels), [labels]);
  // The level being shown: "" for the top, else the parent label's path.
  const [level, setLevel] = useState("");

  const activeId = pathname.startsWith("/l/") ? decodeURIComponent(pathname.slice(3)) : null;
  const activePath = labels.find((l) => l.id === activeId)?.name;
  // Follow the open label: show the level it sits in.
  useEffect(() => {
    if (activePath !== undefined) setLevel(parentOf(activePath));
  }, [activePath]);

  const levelNode = level ? findNode(tree, level) : undefined;
  // A level that no longer exists (label renamed or deleted) falls back to the top.
  const shown = levelNode ? level : "";
  const rows = levelNode?.children ?? tree;

  const q = filter.trim().toLowerCase();
  const matches = useMemo(
    () => (q ? labels.filter((l) => l.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name)) : []),
    [labels, q],
  );

  // Open a new label straight away (an empty view of the workflow through it).
  const create = async (name: string) => {
    setCreating(false);
    setCreateError("");
    if (!name.trim()) return;
    const res = await createWorkspace(shown ? `${shown}/${name}` : name);
    if (res.error || !res.label) return setCreateError(res.error ?? "Couldn't create the label.");
    reloadLabels();
    router.push(hrefFor(res.label.id));
  };

  return (
    <div>
      {pinned.length > 0 && (
        <>
          <p className="mt-3 px-5 pb-1 text-xs font-bold tracking-widest text-side-muted uppercase">Pinned</p>
          {pinned.map((id) => {
            const label = labels.find((l) => l.id === id);
            if (!label) return null;
            const count = openCount(id);
            const color = colorOf(id);
            return (
              <NavRow key={id} href={hrefFor(id)} active={activeId === id} activeColor={color}>
                <span className="mx-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                <span className="truncate font-semibold text-side-strong" title={label.name}>
                  {label.name.split("/").join(" › ")}
                </span>
                <span className="ml-auto flex items-center gap-1 pl-2">
                  {count > 0 && (
                    <span className="rounded-full px-1.5 text-[11px] font-bold text-side-strong ring-1 ring-side-strong/30" title="Open cards">
                      {count}
                    </span>
                  )}
                  <PinButton pinned onToggle={() => togglePin(id)} />
                </span>
              </NavRow>
            );
          })}
        </>
      )}

      {labels.length > 6 && (
        <div className="mx-2 mt-3 mb-1">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setFilter("");
              if (e.key === "Enter" && matches[0]) {
                setFilter("");
                router.push(hrefFor(matches[0].id));
              }
            }}
            placeholder="Find a label"
            aria-label="Find a label"
            className="w-full rounded-xl bg-black/15 px-3 py-1 text-sm text-side-strong outline-none ring-1 ring-side-strong/15 placeholder:text-side-muted/70 focus:ring-side-accent/50"
          />
        </div>
      )}

      {/* All: every card, whatever its label (the whole workflow). */}
      <NavRow href={hrefFor("INBOX")} active={activeId === "INBOX"}>
        <ThemeIcon icon={theme.icons.workspace} size={16} className="mx-0.5 shrink-0" />
        <span className="font-semibold text-side-strong">All</span>
      </NavRow>
      {shown && !q && (
        <div className="mt-1 px-3 pb-1">
          <button
            onClick={() => setLevel(parentOf(shown))}
            className="flex max-w-full min-w-0 items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold tracking-widest text-side-muted uppercase transition hover:bg-white/10 hover:text-side-accent"
            title="Back"
          >
            <span aria-hidden className="text-sm leading-none">
              ‹
            </span>
            <span className="truncate">{shown.includes("/") ? lastOf(parentOf(shown)) : "All labels"}</span>
          </button>
        </div>
      )}
      {q ? (
        <div key="filter" className="animate-fade-in">
          {matches.map((l) => (
            <LabelRow
              key={l.id}
              node={{ segment: l.name, path: l.name, label: l, children: [] }}
              fullPath
              activeId={activeId}
              onOpenLevel={setLevel}
              onNavigate={() => setFilter("")}
            />
          ))}
          {matches.length === 0 && <p className="px-5 py-1 text-sm text-side-muted">No labels match.</p>}
        </div>
      ) : (
        <div key={shown} className="animate-fade-in">
          {levelNode && <LabelRow node={{ ...levelNode, children: [] }} heading activeId={activeId} onOpenLevel={setLevel} />}
          {rows.map((n) => (
            <LabelRow key={n.path} node={n} activeId={activeId} onOpenLevel={setLevel} />
          ))}
        </div>
      )}

      {!q &&
        (creating ? (
          <NewLabelInput placeholder={shown ? `New label in ${lastOf(shown)}` : "Label name, e.g. Clients/JR"} onSubmit={create} />
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="mx-2 mt-2 w-[calc(100%-1rem)] truncate rounded-xl border-2 border-dashed border-side-strong/25 px-3 py-1 text-left text-sm font-semibold text-side-muted transition hover:border-side-accent/60 hover:bg-white/5 hover:text-side-accent"
          >
            + New label{shown ? ` in ${lastOf(shown)}` : ""}
          </button>
        ))}
      {createError && <p className="mx-4 mt-1 text-xs text-red-400">{createError}</p>}
    </div>
  );
}

// One label in the list. `heading` marks the label whose level is open (it sits
// above its sub-labels); `fullPath` shows "Clients › Acme" for filter results.
function LabelRow({
  node,
  activeId,
  onOpenLevel,
  onNavigate,
  heading,
  fullPath,
}: {
  node: Node;
  activeId: string | null;
  onOpenLevel: (path: string) => void;
  onNavigate?: () => void;
  heading?: boolean;
  fullPath?: boolean;
}) {
  const { colorOfPath, labels, pinned, togglePin } = useMail();
  const { theme } = useTheme();
  const iconOf = useMemo(() => makeLabelIcon(labels, theme.icons.labels), [labels, theme]);
  const color = colorOfPath(node.path);
  const active = !!node.label && node.label.id === activeId;
  const topLevel = !node.path.includes("/");
  const hasChildren = node.children.length > 0;
  const name = fullPath ? node.path.split("/").join(" › ") : node.segment;

  const content = (
    <>
      {topLevel ? (
        <span className="w-5 shrink-0 text-center text-base leading-none group-hover:animate-wiggle" aria-hidden>
          <ThemeIcon icon={iconOf(node.path)} size={16} />
        </span>
      ) : (
        <span className="mx-1.5 h-2 w-2 shrink-0 rounded-full ring-2 ring-black/20" style={{ background: color }} />
      )}
      <span
        className={`truncate ${node.label?.unread || topLevel || heading ? "font-bold text-side-strong" : ""}`}
        title={node.path.split("/").join(" › ")}
      >
        {name}
      </span>
      <span className="ml-auto flex items-center gap-1 pl-2">
        {!!node.label?.unread && (
          <span className="rounded-full px-1.5 text-[11px] font-extrabold text-shadow" style={{ background: color }}>
            {node.label.unread}
          </span>
        )}
        {node.label && !pinned.includes(node.label.id) && <PinButton pinned={false} onToggle={() => togglePin(node.label!.id)} />}
        {hasChildren && (
          <span
            role="button"
            aria-label={`Show labels in ${node.segment}`}
            title={`Show labels in ${node.segment}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenLevel(node.path);
            }}
            className="-my-1 -mr-2 rounded-lg px-2 py-0.5 text-base leading-none text-side-muted hover:bg-white/10 hover:text-side-accent"
          >
            ›
          </span>
        )}
      </span>
    </>
  );
  const row = node.label ? (
    <NavRow href={hrefFor(node.label.id)} onClick={onNavigate} active={active} activeColor={color}>
      {content}
    </NavRow>
  ) : (
    // A parent that isn't itself a label just opens its level.
    <NavRow onClick={() => (hasChildren ? onOpenLevel(node.path) : undefined)} active={false}>
      {content}
    </NavRow>
  );
  return heading ? <div className="mb-1 border-b border-side-strong/10 pb-1">{row}</div> : row;
}

function NavRow({
  href,
  onClick,
  active,
  activeColor,
  children,
}: {
  href?: string;
  onClick?: () => void;
  active: boolean;
  activeColor?: string;
  children: React.ReactNode;
}) {
  const className = `group mx-2 flex w-[calc(100%-1rem)] items-center gap-1.5 rounded-xl py-1 pr-3 pl-3 text-left text-sm transition hover:translate-x-0.5 hover:bg-white/10 ${
    active ? "text-side-strong" : ""
  }`;
  const style = active && activeColor ? { background: `${activeColor}33`, boxShadow: `inset 3px 0 0 ${activeColor}` } : undefined;
  return href ? (
    <Link href={href} onClick={onClick} className={className} style={style}>
      {children}
    </Link>
  ) : (
    <button onClick={onClick} className={className} style={style}>
      {children}
    </button>
  );
}

// Pin a label to the top of the sidebar, or unpin it.
function PinButton({ pinned, onToggle }: { pinned: boolean; onToggle: () => void }) {
  return (
    <span
      role="button"
      aria-label={pinned ? "Unpin" : "Pin to the top"}
      title={pinned ? "Unpin" : "Pin to the top"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      className={`w-4 text-center text-xs text-muted hover:text-side-accent hidden group-hover:inline max-md:inline`}
    >
      {pinned ? "✕" : "📌"}
    </span>
  );
}

// Inline input for a new label; Enter creates it, Escape or leaving cancels.
function NewLabelInput({ placeholder, onSubmit }: { placeholder: string; onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form
      className="mx-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(name);
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => onSubmit("")}
        onKeyDown={(e) => e.key === "Escape" && onSubmit("")}
        placeholder={placeholder}
        className="w-full rounded-xl bg-black/20 px-3 py-1 text-sm text-side-strong shadow-[inset_0_2px_4px_rgb(0_0_0/0.3)] outline-none ring-1 ring-side-accent/50 placeholder:text-side-muted/70"
      />
    </form>
  );
}
