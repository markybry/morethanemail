// Plain, serializable shapes passed from server to client components.

export type TaskDTO = { id: string; title: string; notes: string; done: boolean; dueDate: string | null };
export type NoteDTO = { id: string; body: string; createdAt: string };
export type LinkDTO = { id: string; url: string; title: string };

// Enough about a thread to show it and to create its Email record.
// labelIds, when known, is saved so label views can filter without asking Gmail.
export type ThreadSnapshot = { threadId: string; subject: string; from: string; snippet: string; date: string; labelIds?: string[] };

// One email thread on a card, as last seen.
export type CardThread = {
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  newReply: boolean;
  labelIds: string[];
};

// A card as the board shows it. The top-level thread fields are the card's
// first thread (the one it started from). `threads` is every thread on the
// card, newest first, that first one included.
export type BoardEmail = ThreadSnapshot & {
  unread: boolean;
  labelIds: string[];
  notes: NoteDTO[];
  tasks: TaskDTO[];
  links: LinkDTO[];
  newReply: boolean; // has messages newer than the user last opened
  local: boolean; // a ticket with no email: subject is its title, snippet its description
  homeId: string | null; // the workflow it sits in a status of, if any (a card has one home)
  title: string; // the card's title: its own, or the first thread's subject
  summary: string; // where things stand and what was decided
  threads: CardThread[];
  partOf: string | null; // for a thread added to another card: that card's threadId
};

// reopenOnReply: a new reply sends the email back to unsorted for triage.
// finished: work here is done; its cards don't count as open, moving a card
// here archives it in Gmail, and it drops off after two weeks.
// since: when each card came into this status (ISO), by threadId.
export type LaneDTO = {
  id: string;
  name: string;
  reopenOnReply: boolean;
  finished: boolean;
  threadIds: string[];
  since: Record<string, string>;
};

export type TemplateLane = { name: string; reopenOnReply: boolean; finished?: boolean };
export type LaneTemplateDTO = { id: string; name: string; builtIn: boolean; lanes: TemplateLane[] };

// ticketIds: tickets with no email that aren't in a lane (they join the unsorted column).
// lens: the label this workflow is being looked at through, if any. Only that
// label's cards show, and its Gmail emails fill the first column.
export type Lens = { labelId: string; name: string };
export type WorkspaceDTO = { id: string; labelId: string; name: string; lanes: LaneDTO[]; ticketIds: string[]; lens: Lens | null };
