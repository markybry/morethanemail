"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createWorkspace } from "@/app/actions";
import type { MailLabel } from "@/lib/mail";
import { useMail } from "./MailContext";
import { ThemeIcon, useTheme } from "./ThemeContext";
import { makeLabelIcon } from "@/lib/labelColors";

const OPEN_KEY = "mte.labelsOpen";

type Node = { segment: string; path: string; label?: MailLabel; children: Node[] };

// Gmail nests labels by name ("Clients/Acme"), so the tree is built from the names.
// A parent that isn't itself a label still shows, but only expands.
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

const hrefFor = (labelId: string) => `/l/${encodeURIComponent(labelId)}`;

// The workflow first, then the user's labels as a tree. A label is a lens:
// opening it shows the workflow filtered to that label.
export function MailNav() {
  const { labels, reloadLabels, pinned, togglePin, openCount, reloadPins, colorOf } = useMail();
  const pathname = usePathname();
  // Counts change as cards move; refresh them when moving between pages.
  useEffect(() => reloadPins(), [pathname, reloadPins]);
  const router = useRouter();
  // Where a new label is being typed: "" for top level, else the parent's path.
  const [creatingUnder, setCreatingUnder] = useState<string | null>(null);
  const [createError, setCreateError] = useState("");
  const tree = useMemo(() => buildTree(labels), [labels]);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      setOpen(new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]") as string[]));
    } catch {}
  }, []);

  const activeId = pathname.startsWith("/l/") ? decodeURIComponent(pathname.slice(3)) : null;
  // Keep the branch holding the open label expanded.
  const activePath = labels.find((l) => l.id === activeId)?.name;
  const isOpen = (path: string) => open.has(path) || (!!activePath && activePath.startsWith(`${path}/`));

  const toggle = (path: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  // Open a new label straight away (an empty view of the workflow through it).
  const create = async (name: string) => {
    const parent = creatingUnder;
    setCreatingUnder(null);
    setCreateError("");
    if (!name.trim()) return;
    const res = await createWorkspace(parent ? `${parent}/${name}` : name);
    if (res.error || !res.label) return setCreateError(res.error ?? "Couldn't create the label.");
    if (parent) setOpen((prev) => new Set(prev).add(parent));
    reloadLabels();
    router.push(hrefFor(res.label.id));
  };

  const startChild = (path: string) => {
    setOpen((prev) => new Set(prev).add(path));
    setCreatingUnder(path);
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
              <NavRow key={id} href={hrefFor(id)} active={activeId === id} activeColor={color} depth={0}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
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
      <p className="mt-3 px-5 pb-1 text-xs font-bold tracking-widest text-side-muted uppercase">{pinned.length > 0 ? "All labels" : "Labels"}</p>
      {tree.map((n) => (
        <TreeNode
          key={n.path}
          node={n}
          depth={0}
          activeId={activeId}
          isOpen={isOpen}
          onToggle={toggle}
          onAddChild={startChild}
          creatingUnder={creatingUnder}
          onCreate={create}
        />
      ))}
      {creatingUnder === "" ? (
        <NewLabelInput placeholder="Label name, e.g. Clients/JR" onSubmit={create} />
      ) : (
        <button
          onClick={() => setCreatingUnder("")}
          className="mx-2 mt-2 w-[calc(100%-1rem)] rounded-xl border-2 border-dashed border-side-strong/25 px-3 py-1 text-left text-sm font-semibold text-side-muted transition hover:border-side-accent/60 hover:bg-white/5 hover:text-side-accent"
        >
          + New label
        </button>
      )}
      {createError && <p className="mx-4 mt-1 text-xs text-red-400">{createError}</p>}
    </div>
  );
}

function TreeNode({
  node,
  depth,
  activeId,
  isOpen,
  onToggle,
  onAddChild,
  creatingUnder,
  onCreate,
}: {
  node: Node;
  depth: number;
  activeId: string | null;
  isOpen: (path: string) => boolean;
  onToggle: (path: string) => void;
  onAddChild: (path: string) => void;
  creatingUnder: string | null;
  onCreate: (name: string) => void;
}) {
  const { colorOfPath, labels, pinned, togglePin } = useMail();
  const { theme } = useTheme();
  const iconOf = useMemo(() => makeLabelIcon(labels, theme.icons.labels), [labels, theme]);
  const color = colorOfPath(node.path);
  const expanded = isOpen(node.path);
  const active = !!node.label && node.label.id === activeId;
  const chevron =
    node.children.length > 0 ? (
      <span
        role="button"
        aria-label={expanded ? "Collapse" : "Expand"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggle(node.path);
        }}
        className="w-3 shrink-0 text-center text-muted hover:text-white"
      >
        {expanded ? "▾" : "▸"}
      </span>
    ) : undefined;
  const content = (
    <>
      {depth === 0 ? (
        <span className="w-5 shrink-0 text-center text-base leading-none group-hover:animate-wiggle" aria-hidden>
          <ThemeIcon icon={iconOf(node.path)} size={16} />
        </span>
      ) : (
        <span className="h-2 w-2 shrink-0 rounded-full ring-2 ring-black/20" style={{ background: color }} />
      )}
      <span className={`truncate ${node.label?.unread || depth === 0 ? "font-bold text-side-strong" : ""}`}>{node.segment}</span>
      <span className="ml-auto flex items-center gap-1 pl-2">
        {!!node.label?.unread && (
          <span className="rounded-full px-1.5 text-[11px] font-extrabold text-shadow" style={{ background: color }}>
            {node.label.unread}
          </span>
        )}
        {node.label && !pinned.includes(node.label.id) && <PinButton pinned={false} onToggle={() => togglePin(node.label!.id)} />}
        <span
          role="button"
          aria-label={`New label under ${node.path}`}
          title={`New label under ${node.path.split("/").join(" › ")}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAddChild(node.path);
          }}
          className="hidden w-4 text-center text-muted group-hover:inline hover:text-white max-md:inline"
        >
          +
        </span>
      </span>
    </>
  );
  return (
    <>
      {node.label ? (
        <NavRow href={hrefFor(node.label.id)} active={active} activeColor={color} depth={depth} chevron={chevron}>
          {content}
        </NavRow>
      ) : (
        <NavRow onClick={() => onToggle(node.path)} active={false} depth={depth} chevron={chevron}>
          {content}
        </NavRow>
      )}
      {(expanded || creatingUnder === node.path) && (
        // Children sit beside a guide line in the branch colour, so it's clear
        // which parent they belong to even with several branches open.
        <div className="relative ml-[22px]">
          {/* A stitched thread in the branch colour links children to their parent. */}
          <span className="absolute top-0 bottom-1 left-2 border-l-2 border-dashed" style={{ borderColor: color, opacity: 0.75 }} />
          <div className="pl-2">
            {expanded &&
              node.children.map((c) => (
                <TreeNode
                  key={c.path}
                  node={c}
                  depth={depth + 1}
                  activeId={activeId}
                  isOpen={isOpen}
                  onToggle={onToggle}
                  onAddChild={onAddChild}
                  creatingUnder={creatingUnder}
                  onCreate={onCreate}
                />
              ))}
            {creatingUnder === node.path && <NewLabelInput placeholder="New label name" onSubmit={onCreate} />}
          </div>
        </div>
      )}
    </>
  );
}

function NavRow({
  href,
  onClick,
  active,
  activeColor,
  depth,
  chevron,
  children,
}: {
  href?: string;
  onClick?: () => void;
  active: boolean;
  activeColor?: string;
  depth: number;
  chevron?: React.ReactNode;
  children: React.ReactNode;
}) {
  const className = `group mx-2 flex w-[calc(100%-1rem)] items-center gap-1.5 rounded-xl py-1 pr-3 text-left text-sm transition hover:translate-x-0.5 hover:bg-white/10 ${
    active ? "text-side-strong" : ""
  }`;
  // Nesting is shown by the guide-line containers, so rows only need a little padding.
  const style = {
    paddingLeft: depth === 0 ? 12 : 6,
    ...(active && activeColor ? { background: `${activeColor}33`, boxShadow: `inset 3px 0 0 ${activeColor}` } : {}),
  };
  const inner = (
    <>
      {chevron ?? <span className="w-3 shrink-0" />}
      {children}
    </>
  );
  return href ? (
    <Link href={href} className={className} style={style}>
      {inner}
    </Link>
  ) : (
    <button onClick={onClick} className={className} style={style}>
      {inner}
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
