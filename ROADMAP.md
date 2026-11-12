# Roadmap: one workflow, labels as lenses

_Written 12 November 2026, fifth pass. Nothing here is built yet._

## The idea in one line

**One workflow with one set of statuses. A card is a piece of work and can hold several email threads. A label is a lens on the workflow, not a place of its own. Clients and projects are just labels.**

## The words

| Word | Meaning |
|---|---|
| **Workflow** | The set of statuses a piece of work moves through. There is one main workflow. Replaces "workspace". |
| **Status** | One step in a workflow, shown as a column (To do, WIP, Waiting, Blocked, Done). |
| **Card** | One piece of work. Holds one or more email threads, or none, plus notes, tasks, links and a summary. |
| **Label** | A Gmail label. Says what a card is about. Used to filter and get around. |
| **Client, project** | Not things in the app. Each is just a label, and so just a view of the workflow. |

## Why the current model loses things

Today every label has its own statuses, and one email can sit in a different status under each of its labels. That mixes up two separate questions:

- **Where is this up to?** (new, doing, waiting, done)
- **What is this about?** (which client, which topic)

Statuses answer the first. Labels answer the second. Giving every label its own statuses means "where is this up to?" has a different answer depending on where you stand, and you have to visit every label to see your work.

The fix is to keep the two apart: **one answer to "where is this up to?", and labels only for "what is this about?"**

## How it works

### The workflow

- There is one main workflow. Its first column is your **Inbox**, live from Gmail. The rest are your statuses: To do, WIP, Waiting, Blocked, Done. You can rename, add and reorder them.
- **A card is in one status, full stop.** It is the same wherever you look at it from.

### Cards

A card is one piece of work (one stream), not one email. Real work does not stay in one thread: someone starts a fresh email to tidy up, other people write in separately, a decision is made and a new thread starts from it, and some of it happens off email altogether.

- A card starts as one email, with no extra effort: drag an email into a status and that is the card.
- **More threads can be added to a card.** Drop a new email onto an existing card, or choose "Add to a card" in the email panel. The card keeps its status, notes, tasks and links.
- Opening a card shows its threads newest first. Older or superseded threads stay attached but folded away.
- A reply on any of its threads counts as a reply on the card.
- **A summary sits at the top of the card**: where things stand and what was decided. When a long conversation is replaced by a fresh thread, the summary is what carries over.
- A card has a title you can change. It starts as the first email's subject.
- A card needs no email at all. Calls, meetings and things said in person go in as notes.
- Adding a thread to a card gives it the card's labels in Gmail, so Gmail stays in step.
- When a new email looks like it belongs to an existing card (same people, same label), the app offers that card first.

### Labels

- The label tree stays in the sidebar, exactly as now. It is still how you get around.
- Clicking a label shows **the same workflow, the same statuses, narrowed to that label's cards**. Click "Clients/JR" and you see what is in play for JR and where each thing is up to. A parent label includes its sub-labels.
- The first column in that view lists the label's other mail from Gmail, so you can pull an old email onto the workflow.
- Clicking a label never creates anything.
- Cards show their labels as coloured tags, so the unfiltered workflow is readable at a glance.

### Clients and projects

Neither is a thing in the app. **A client is a label and a project is a sub-label** (`Clients/JR/Lease renewal`), which is how the Gmail account is already organised. Nothing is ever done to a client or a project itself. They only filter what belongs to them, and they all use the same workflow.

The app knows nothing about "clients" or "projects". It only knows labels and sub-labels, so the same rules work for any label tree.

- **Any label** shows the workflow narrowed to its cards.
- **A label with sub-labels** shows **one row per sub-label**: statuses across the top, sub-labels down the side. Cards that carry only the parent label sit in a "General" row. So a client shows a row per project.
- **A new project** is a new sub-label, made from the sidebar or from a card.
- A **card** is one piece of work with one status. A job with parts that move separately (one waiting, one done, one not started) is several cards with the same label.
- Small steps inside one piece of work are **tasks** on the card, not more cards.
- Labels you are working in a lot can be **pinned** to the top of the sidebar. Unpin them when the work is over.

### What Gmail owns and what the app owns

- Gmail owns the mail and the labels. The app applies and removes labels in Gmail, as now.
- The app owns which status a card is in. Changing a label in Gmail does not move a card out of its status.

### What you would see

- **Sidebar:** Workflow, My tasks, then pinned labels (a few), then the label tree.
- **Every day:** open the workflow. Work down the Inbox column: drag to a status, or archive what needs nothing.
- **"What's happening with JR?":** click the label. Same statuses, only JR's cards.
- **Something grows:** more emails go onto the card. If it splits into parts that move separately, make a card for each part under one label and pin the label.
- **It ends:** the cards reach Done and you unpin the label.

## What changes in the code

Less than it sounds, because the label page and the workflow component stay.

- `prisma/schema.prisma`: `Placement` becomes unique per email (today it is unique per workspace and email). In step 2, a card can hold several Gmail threads: a new table lists the threads on each card, and the card gains a title and a summary. `Workspace` stays, but only for the main workflow (the Inbox one) and, until you fold them in, for old label workspaces that already have statuses. `Email` gains a saved copy of its label ids so filtering is instant, and so tickets with no email can carry labels too. `Placement` gains the date the card was put there.
- `src/lib/board.ts`: `ensureWorkspace` stops creating a workspace for every label opened.
- `src/app/(app)/l/[labelId]/page.tsx`: a label opens the main workflow with that label as the filter.
- `src/components/LabelBoard.tsx`: takes an optional label filter. The first column hides threads that are already in a status.
- `src/app/actions.ts`: `setEmailLabels` stops deleting placements when a label is removed.
- `src/components/EmailPanel.tsx`: "Workspaces" becomes "Labels". "Make this its own workspace" becomes "New label for this card".
- Kept as they are: statuses and status templates (called lanes in the code today), reopen on reply, tickets, notes, tasks, links, the activity log, themes.

## Steps

Each step is one pull request that leaves the app working and better than before.

### Step 0: protect the data (skipped)

Not needed: nothing was in live use, so step 1 simply clears the old label workspaces.

### Step 1: one workflow, labels as lenses (built, on branch `one-workflow`)

This is the whole change of model in one go.

- A card can be in only one status.
- Labels with no statuses of their own stop being workspaces. Their empty workspace rows are deleted.
- Clicking such a label opens the main workflow filtered to it.
- All old label workspaces are cleared (nothing was in live use). Emails' notes, tasks and links are kept.
- The main workflow starts with To do, WIP, Waiting, Blocked and Done if it has no statuses. Waiting and Done reopen on a reply.
- Label ids are saved on each card and refreshed from Gmail in the background.
- The reopen-on-reply rule now has one status to act on, so a reply always brings a card back to the same place.

Done when: a card shows the same status from every label, and opening a label creates nothing.

### Step 2: a card holds a whole stream

- Add a thread to an existing card: drop an Inbox email onto a card in a status, or pick "Add to a card" in the email panel, which lists likely cards first (same label, same people).
- The card panel shows all its threads, newest open, the rest folded. Each has "Open in Gmail".
- Add several at once: tick emails in the Inbox column, then drop them on a card or make one new card from them.
- From inside a card, "Add an email" searches your mail for older threads that belong with it.
- Take a thread off a card again if it was added by mistake. It becomes its own card.
- A card title you can edit, and a summary at the top of the card.
- New replies, reopen on reply and unread marks work across all of a card's threads.
- Adding a thread applies the card's labels to it in Gmail.
- Each existing card carries over as a card with one thread. Nothing is lost.

Done when: a case that has moved across three email threads is one card with one status, one task list and one summary.

### Step 3: pinned labels and splitting cards

- **Rows per sub-label:** a label with sub-labels shows one row for each, across the same statuses. Dragging a card to another row swaps its sub-label in Gmail.
- **Pick the label when a card is made:** dragging an Inbox email into a status while a label is selected gives it that label. On the unfiltered workflow, the card offers a quick label picker.
- **Pin a label** to the top of the sidebar, with a count of its cards that are not finished.
- **New label for this card** in the card panel (a nested label, as now), for when one card turns into several.
- **Split a card:** move a thread off a card into a new card with the same labels.

Done when: the top of the sidebar shows only the labels you are working in.

### Step 4: a faster inbox

The point of this step is that the Inbox column can actually be emptied.

- **Archive** on each Inbox card (one click, and the `e` key), for mail that needs nothing. Number keys send the selected card to a status.
- **A status can be marked as finished** (Done). Cards that land there are archived in Gmail, and drop off the workflow after two weeks. They can still be found through their label and through search.
- **Age on cards:** "waiting 6 days". Cards that have sat too long in a waiting status are highlighted, so nothing rots quietly.
- **Counts** on each status and on the Inbox.

Done when: you can get the Inbox column to empty, and stale waiting cards are obvious.

### Step 5: phone

- One status at a time, with tabs along the top and swipe between them.
- On an Inbox card: swipe one way to archive, the other to choose a status. No dragging needed.
- Pinned labels and the label tree in the slide-in menu, as now.

### Step 6: tidy the edges

- The dashboard becomes **Today**: due tasks, new replies, stale waiting cards, recent activity. The per-workspace panel goes, because the workflow already shows it.
- README and demo data rewritten around the workflow, lenses and one pinned label with several cards.
- The word "workspace" removed from the app.

## Later, only if needed

- **Its own statuses for one label**, if a job ever truly needs different steps. Left out on purpose: every project uses the same workflow today.
- **Reply from inside the app.** Today "Open in Gmail" does this job.
- **Work-in-progress limits** on statuses.
- **A saved Gmail search as a lens**, as well as labels (for example everything from one sender).

## Decisions to confirm

One choice has a default so work can start. It can be changed before its step.

| Decision | Default | Step |
|---|---|---|
| Does moving a card to a finished status archive it in Gmail? | Yes. Moving to any other status leaves Gmail's inbox alone. | 4 |

## What was dropped from the first draft, and why

- **A separate "label view" list.** A label now shows the workflow itself, filtered. One screen to learn.
- **Boards with no label, merging boards, reordering and archiving boards.** Replaced by pinning a label.
- **Boards as a new thing in the database.** The existing workspace table does the job for the main workflow.
