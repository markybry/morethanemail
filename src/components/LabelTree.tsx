"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createWorkspace } from "@/app/actions";
import type { MailLabel } from "@/lib/mail";
import { useMail } from "./MailContext";

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

// Every label is a workspace: Inbox first, then the user's labels as a tree.
export function MailNav() {
  const { labels, reloadLabels } = useMail();
  const pathname = usePathname();
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

  // Creating a label creates its workspace; open it straight away.
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
      <NavRow href={hrefFor("INBOX")} active={activeId === "INBOX"} depth={0}>
        <span className="truncate">Inbox</span>
      </NavRow>
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
          className="mx-2 mt-2 w-[calc(100%-1rem)] rounded-lg border border-dashed border-violet-400/40 px-3 py-1 text-left text-sm text-violet-300 transition hover:border-pink-300/60 hover:bg-white/5 hover:text-pink-200"
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
  const { colorOfPath } = useMail();
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
        className="w-3 shrink-0 text-center text-slate-500 hover:text-white"
      >
        {expanded ? "▾" : "▸"}
      </span>
    ) : undefined;
  const content = (
    <>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_8px_currentColor]" style={{ background: color, color }} />
      <span className={`truncate ${node.label?.unread || depth === 0 ? "font-semibold text-white" : ""}`}>{node.segment}</span>
      <span className="ml-auto flex items-center gap-1 pl-2">
        {!!node.label?.unread && (
          <span className="rounded-full px-1.5 text-[11px] font-bold text-white" style={{ background: color }}>
            {node.label.unread}
          </span>
        )}
        <span
          role="button"
          aria-label={`New label under ${node.path}`}
          title={`New label under ${node.path.split("/").join(" › ")}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAddChild(node.path);
          }}
          className="hidden w-4 text-center text-slate-500 group-hover:inline hover:text-white"
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
          <span className="absolute top-0 bottom-1 left-2 w-0.5 rounded-full" style={{ background: color, opacity: 0.7, boxShadow: `0 0 6px ${color}` }} />
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
  const className = `group mx-2 flex w-[calc(100%-1rem)] items-center gap-1.5 rounded-lg py-1 pr-3 text-left text-sm transition hover:translate-x-0.5 hover:bg-white/10 ${
    active ? "text-white" : ""
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
        className="w-full rounded-lg bg-white/10 px-3 py-1 text-sm text-white outline-none ring-1 ring-fuchsia-400/50 placeholder:text-violet-300/60"
      />
    </form>
  );
}
