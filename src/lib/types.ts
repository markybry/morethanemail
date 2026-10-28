// Plain, serializable shapes passed from server to client components.

export type TaskDTO = { id: string; title: string; done: boolean; dueDate: string | null };
export type NoteDTO = { id: string; body: string; createdAt: string };

// Enough about a thread to show it and to create its Email record.
export type ThreadSnapshot = { threadId: string; subject: string; from: string; snippet: string; date: string };

// An email as the board shows it. The email is the ticket: notes and tasks
// belong to it directly.
export type BoardEmail = ThreadSnapshot & {
  unread: boolean;
  labelIds: string[];
  notes: NoteDTO[];
  tasks: TaskDTO[];
  newReply: boolean; // has messages newer than the user last opened
  local: boolean; // a ticket with no email: subject is its title, snippet its description
};

// reopenOnReply: a new reply sends the email back to unsorted for triage.
export type LaneDTO = { id: string; name: string; reopenOnReply: boolean; threadIds: string[] };

export type TemplateLane = { name: string; reopenOnReply: boolean };
export type LaneTemplateDTO = { id: string; name: string; builtIn: boolean; lanes: TemplateLane[] };

// ticketIds: tickets with no email that aren't in a lane (they join the unsorted column).
export type WorkspaceDTO = { id: string; labelId: string; name: string; lanes: LaneDTO[]; ticketIds: string[] };
