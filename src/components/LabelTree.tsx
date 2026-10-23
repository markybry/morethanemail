"use client";

import { useEffect, useMemo, useState } from "react";
import type { MailLabel, MailView } from "@/lib/mail";
import { useMail } from "./MailContext";

const OPEN_KEY = "mte.labelsOpen";

type Node = { segment: string; path: string; label?: MailLabel; children: Node[] };

// Gmail nests labels by name ("Clients/Acme"), so the tree is built from the names.
// A parent that isn't itself a label still shows, just not clickable.
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

export function MailNav() {
  const { view, setView, labels } = useMail();
  const tree = useMemo(() => buildTree(labels), [labels]);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      setOpen(new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]") as string[]));
    } catch {}
  }, []);

  // Keep the branch holding the open label expanded.
  const activePath = labels.find((l) => view === `label:${l.id}`)?.name;
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

  const inboxActive = view === "primary" || view === "inbox";

  return (
    <div>
      <p className="px-5 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Mail</p>
      <NavRow active={inboxActive} depth={0} onClick={() => setView("primary")}>
        <span className="truncate">Inbox</span>
      </NavRow>
      {tree.map((n) => (
        <TreeNode key={n.path} node={n} depth={0} view={view} isOpen={isOpen} onToggle={toggle} onSelect={setView} />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  depth,
  view,
  isOpen,
  onToggle,
  onSelect,
}: {
  node: Node;
  depth: number;
  view: MailView;
  isOpen: (path: string) => boolean;
  onToggle: (path: string) => void;
  onSelect: (v: MailView) => void;
}) {
  const expanded = isOpen(node.path);
  const hasChildren = node.children.length > 0;
  const active = !!node.label && view === `label:${node.label.id}`;
  return (
    <>
      <NavRow
        active={active}
        depth={depth}
        onClick={() => (node.label ? onSelect(`label:${node.label.id}`) : onToggle(node.path))}
        chevron={
          hasChildren ? (
            <span
              role="button"
              aria-label={expanded ? "Collapse" : "Expand"}
              onClick={(e) => {
                e.stopPropagation();
                onToggle(node.path);
              }}
              className="w-3 shrink-0 text-center text-slate-500 hover:text-white"
            >
              {expanded ? "▾" : "▸"}
            </span>
          ) : (
            <span className="w-3 shrink-0" />
          )
        }
      >
        <span className={`truncate ${node.label?.unread ? "font-medium text-slate-100" : ""}`}>{node.segment}</span>
        {!!node.label?.unread && <span className="ml-auto pl-2 text-xs text-slate-400">{node.label.unread}</span>}
      </NavRow>
      {expanded &&
        node.children.map((c) => (
          <TreeNode key={c.path} node={c} depth={depth + 1} view={view} isOpen={isOpen} onToggle={onToggle} onSelect={onSelect} />
        ))}
    </>
  );
}

function NavRow({
  active,
  depth,
  chevron,
  onClick,
  children,
}: {
  active: boolean;
  depth: number;
  chevron?: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{ paddingLeft: 12 + depth * 14 }}
      className={`mx-2 flex w-[calc(100%-1rem)] items-center gap-1.5 rounded-md py-1 pr-3 text-left text-sm hover:bg-slate-800 ${
        active ? "bg-slate-800 text-white" : ""
      }`}
    >
      {chevron ?? <span className="w-3 shrink-0" />}
      {children}
    </button>
  );
}
