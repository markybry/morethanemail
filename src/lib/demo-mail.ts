import type { MailLabel, ThreadDetail, ThreadSummary } from "./mail";

// Sample mailbox used when the app runs without Google credentials.
const SEED_LABELS: MailLabel[] = [
  { id: "Label_clients", name: "Clients", unread: 1 },
  { id: "Label_acme", name: "Clients/Acme", unread: 1 },
  { id: "Label_studio9", name: "Clients/Studio 9", unread: 0 },
  { id: "Label_finance", name: "Finance", unread: 0 },
  { id: "Label_home", name: "Home", unread: 1 },
  { id: "Label_kitchen", name: "Home/Kitchen extension", unread: 1 },
];

type DemoThread = {
  id: string;
  from: string;
  subject: string;
  body: string;
  hoursAgo: number;
  unread?: boolean;
  labels?: string[];
};

const SEED_THREADS: DemoThread[] = [
  { id: "demo-1", from: "Sarah Chen <sarah@acme.co>", subject: "Q4 website redesign - kickoff", hoursAgo: 2, unread: true, labels: ["INBOX", "CATEGORY_PERSONAL", "Label_clients", "Label_acme"],
    body: "Hi,\n\nThanks for the call earlier. Attached is the brief for the Q4 redesign. Could you send over a rough timeline and quote by Friday?\n\nKey asks:\n- New homepage\n- Pricing page refresh\n- Blog migration\n\nCheers,\nSarah" },
  { id: "demo-2", from: "Accounts <billing@hostly.io>", subject: "Invoice #4821 is due in 7 days", hoursAgo: 5, labels: ["INBOX", "CATEGORY_UPDATES", "Label_finance"],
    body: "Your invoice #4821 for £49.00 is due on the 30th. Pay online from your account dashboard." },
  { id: "demo-3", from: "Tom Ellis <tom@ellisbuild.com>", subject: "Re: Kitchen extension - planning drawings", hoursAgo: 20, unread: true, labels: ["INBOX", "CATEGORY_PERSONAL", "Label_home", "Label_kitchen"],
    body: "Morning,\n\nThe architect has finished the revised drawings. Can you review and confirm by Wednesday so we can submit to the council?\n\nTom" },
  { id: "demo-4", from: "Priya Patel <priya@studio9.design>", subject: "Logo concepts v2", hoursAgo: 30, labels: ["INBOX", "CATEGORY_PERSONAL", "Label_clients", "Label_studio9"],
    body: "Hey! Round two of logo concepts attached. I've pushed concept B further as discussed. Let me know your thoughts.\n\nPriya" },
  { id: "demo-5", from: "GitHub <noreply@github.com>", subject: "[morethanemail] CI passed on main", hoursAgo: 40, labels: ["INBOX", "CATEGORY_UPDATES"],
    body: "All checks have passed on main." },
  { id: "demo-6", from: "Jamie Ward <jamie@ward.family>", subject: "Weekend plans?", hoursAgo: 52, labels: ["INBOX", "CATEGORY_PERSONAL"],
    body: "Are you free Saturday? Thinking of a walk then pub lunch." },
  { id: "demo-7", from: "Recruiting <talent@bigcorp.com>", subject: "Interview scheduling - Senior Engineer", hoursAgo: 70, unread: true, labels: ["INBOX", "CATEGORY_PERSONAL"],
    body: "We'd love to set up a second-round interview. Please reply with three slots that suit you next week." },
  { id: "demo-8", from: "Insurance Direct <noreply@insdirect.co.uk>", subject: "Your car insurance renewal", hoursAgo: 96, labels: ["INBOX", "CATEGORY_UPDATES", "Label_finance"],
    body: "Your policy renews on 14 November. Review your renewal quote before then to avoid auto-renewal." },
  { id: "demo-9", from: "MegaStore <deals@megastore.com>", subject: "48 hours only: 30% off everything", hoursAgo: 3, unread: true, labels: ["INBOX", "CATEGORY_PROMOTIONS"],
    body: "Our biggest sale of the season. Don't miss out!" },
  { id: "demo-10", from: "Old Client <ops@oldclient.com>", subject: "Thanks for wrapping up the migration", hoursAgo: 400, labels: ["Label_clients"],
    body: "All done on our side. Thanks again!" },
];

// The demo mailbox is edited in memory (labels applied, labels created). Next.js
// can load this module more than once (pages and server actions), so the state
// lives on globalThis to be shared. Dates are fixed per server process, so a
// filed demo email doesn't look like it got a new reply.
const store = ((globalThis as { __mteDemoMail?: { labels: MailLabel[]; threads: DemoThread[]; base: number } }).__mteDemoMail ??= {
  labels: structuredClone(SEED_LABELS),
  threads: structuredClone(SEED_THREADS),
  base: Date.now(),
});
const LABELS = store.labels;
const DEMO = store.threads;
const BASE = store.base;
const at = (hoursAgo: number) => new Date(BASE - hoursAgo * 3_600_000).toISOString();

const OTHER_TABS = ["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_UPDATES", "CATEGORY_FORUMS"];

// With no label, returns every demo thread (used to look threads up by id).
export function demoThreads(labelId?: string, primaryOnly = false, query?: string): ThreadSummary[] {
  const q = query?.toLowerCase();
  return DEMO.filter((d) => {
    const has = (l: string) => d.labels?.includes(l) ?? false;
    if (labelId && !has(labelId)) return false;
    if (primaryOnly && OTHER_TABS.some(has)) return false;
    return !q || `${d.from} ${d.subject} ${d.body}`.toLowerCase().includes(q);
  }).map((d) => ({
    threadId: d.id,
    subject: d.subject,
    from: d.from,
    snippet: d.body.replace(/\s+/g, " ").slice(0, 140),
    date: at(d.hoursAgo),
    unread: !!d.unread,
    messageCount: 1,
    labelIds: d.labels ?? [],
  }));
}

export const demoLabels = () => LABELS;

// The demo mailbox lives in memory, so label changes last until the server restarts.
export function demoModifyLabels(threadId: string, add: string[], remove: string[]): string[] {
  const d = DEMO.find((x) => x.id === threadId);
  if (!d) return [];
  d.labels = [...new Set([...(d.labels ?? []).filter((l) => !remove.includes(l)), ...add])];
  return d.labels;
}

export function demoCreateLabel(name: string): MailLabel {
  const label = { id: `Label_${Date.now()}`, name, unread: 0 };
  LABELS.push(label);
  LABELS.sort((a, b) => a.name.localeCompare(b.name));
  return label;
}

export function demoThreadDetail(threadId: string): ThreadDetail | null {
  const d = DEMO.find((x) => x.id === threadId);
  if (!d) return null;
  return {
    threadId,
    subject: d.subject,
    messages: [{ id: d.id, from: d.from, to: "you@example.com", date: at(d.hoursAgo), subject: d.subject, html: null, text: d.body, attachments: [] }],
  };
}
