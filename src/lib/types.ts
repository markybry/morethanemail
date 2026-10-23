// Plain, serializable shapes passed from server to client components.

export type TaskDTO = { id: string; title: string; done: boolean; dueDate: string | null };
export type NoteDTO = { id: string; body: string; createdAt: string };
export type CaseEmailDTO = { id: string; threadId: string; subject: string; from: string; snippet: string; emailDate: string };

// A case: the card on a board. Starts small (often one email) and grows.
export type CardDTO = {
  id: string;
  laneId: string;
  title: string;
  emails: CaseEmailDTO[]; // newest first
  notes: NoteDTO[];
  tasks: TaskDTO[];
};

export type LaneDTO = { id: string; name: string; cards: CardDTO[] };

export type ProjectDTO = {
  id: string;
  name: string;
  color: string;
  origin: { cardId: string; title: string } | null;
  lanes: LaneDTO[];
};

export type ProjectListItem = { id: string; name: string; color: string };

// Where an inbox thread has already been filed.
export type FiledInfo = { cardId: string; cardTitle: string; projectId: string; projectName: string; laneName: string };

// Every case, for "move to" / "attach to" pickers.
export type CaseOption = { id: string; title: string; projectId: string; projectName: string; laneName: string };
export type LaneOption = { id: string; name: string; projectId: string; projectName: string };
