"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const { labels } = useMail();
  const pathname = usePathname();
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

  return (
    <div>
      <NavRow href={hrefFor("INBOX")} active={activeId === "INBOX"} depth={0}>
        <span className="truncate">Inbox</span>
      </NavRow>
      {tree.map((n) => (
        <TreeNode key={n.path} node={n} depth={0} activeId={activeId} isOpen={isOpen} onToggle={toggle} />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  depth,
  activeId,
  isOpen,
  onToggle,
}: {
  node: Node;
  depth: number;
  activeId: string | null;
  isOpen: (path: string) => boolean;
  onToggle: (path: string) => void;
}) {
  const expanded = isOpen(node.path);
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
      <span className={`truncate ${node.label?.unread ? "font-medium text-slate-100" : ""}`}>{node.segment}</span>
      {!!node.label?.unread && <span className="ml-auto pl-2 text-xs text-slate-400">{node.label.unread}</span>}
    </>
  );
  return (
    <>
      {node.label ? (
        <NavRow href={hrefFor(node.label.id)} active={node.label.id === activeId} depth={depth} chevron={chevron}>
          {content}
        </NavRow>
      ) : (
        <NavRow onClick={() => onToggle(node.path)} active={false} depth={depth} chevron={chevron}>
          {content}
        </NavRow>
      )}
      {expanded &&
        node.children.map((c) => (
          <TreeNode key={c.path} node={c} depth={depth + 1} activeId={activeId} isOpen={isOpen} onToggle={onToggle} />
        ))}
    </>
  );
}

function NavRow({
  href,
  onClick,
  active,
  depth,
  chevron,
  children,
}: {
  href?: string;
  onClick?: () => void;
  active: boolean;
  depth: number;
  chevron?: React.ReactNode;
  children: React.ReactNode;
}) {
  const className = `mx-2 flex w-[calc(100%-1rem)] items-center gap-1.5 rounded-md py-1 pr-3 text-left text-sm hover:bg-slate-800 ${
    active ? "bg-slate-800 text-white" : ""
  }`;
  const style = { paddingLeft: 12 + depth * 14 };
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
