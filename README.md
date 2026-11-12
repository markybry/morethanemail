# More Than Email

An email client in the style of Sortd and Trello, run entirely off Gmail labels and emails.

How it's organised (the plan and its history are in [ROADMAP.md](ROADMAP.md)):

- **One workflow.** Its first column is your Inbox, live from Gmail. The rest are your statuses: To do, WIP, Waiting, Blocked and Done to start with. Rename, add, reorder or delete them. Drag an email into a status and it becomes a card.
- **A card is one piece of work.** It sits in one status, the same wherever you look at it from. It shows its title, its summary (or newest message) and its next actions, which you can tick off from the card. Notes and links are kept on it too.
- **A card can hold several email threads.** In the card panel, "Add to another card" puts an email into a card (cards sharing labels or people are listed first), and "Add an email to this card" searches all mail for older threads. "Split off" makes a thread its own card again. Replies on any of its threads count as replies on the card.
- **Labels are lenses.** The sidebar shows your Gmail labels as a nested tree with unread counts. Opening a label shows the same workflow with only that label's cards, sub-labels included; a label with sub-labels splits each status into one row per sub-label, and dragging a card to another row swaps its sub-label in Gmail. Opening a label never creates anything. Pin the labels you're working in (📌) to the top of the sidebar, with a count of their open cards.
- **Labels are Gmail's.** Add or remove labels in the card panel; the change is made in Gmail and the card keeps its status. Inbox is just a label, so removing it archives the email.
- **Triage fast.** The first column switches between "To triage" (not yet in a status) and "Recent" (the Primary inbox plus everything labelled, newest first, cards in a status marked). With an email open, the number keys file it into a status and `e` archives it, then the next email opens. Each Inbox email also has an Archive button.
- **Finished statuses** (Done, by default; toggle with ✓ on any status) archive a card's emails in Gmail when it arrives, and the card drops off the board after two weeks. It's still found through its labels, Recent and search.
- **Nothing rots quietly.** Cards show how long they've been in their status, and anything a week or more in a waiting status (one that reopens on reply, ↩) is flagged. A new reply on a card in a ↩ status sends it back to the first column.
- **Today** shows next actions by due date, new replies, cards waiting too long and recent activity. **Next actions** lists every action across your cards, plus ones of their own.
- **Readable threads.** Older messages fold to their first lines, and quoted copies of earlier messages hide behind "show quoted text". Embedded images and attachments show in the email.
- **On a phone**, statuses show one at a time with tabs, and each card has a "Move to…" menu (and Inbox cards an Archive button), so nothing needs dragging.
- **Themes**: Woodland, Georgian writing desk, Pixel office, Dev (compact), Dark and Light. **Resizable layout**: drag the edges of the sidebar, the first column, the statuses and the card panel; double-click an edge to reset it.

Stack: Next.js 15 (App Router, server actions) · Prisma + Postgres · Gmail API (`gmail.modify`: read mail and change labels; never sends or deletes) · dnd-kit · Tailwind.

## Deploy (GitHub → Vercel)

1. **Google OAuth client.** In the [Google Cloud Console](https://console.cloud.google.com/):
   - Create a project, then enable the **Gmail API**.
   - On the **OAuth consent screen**, choose External and add yourself as a test user. Add the `gmail.modify` scope (the app reads mail and applies or removes labels; it never sends or deletes mail).
   - Under **Credentials → Create OAuth client ID**, choose Web application. Add these as authorised redirect URIs:
     - `https://<your-app>.vercel.app/api/auth/google/callback`
     - `http://localhost:3000/api/auth/google/callback`
2. **Vercel project.** Import this GitHub repo in Vercel. Pushes to `main` deploy to production; pull requests get preview deployments.
3. **Database.** In the Vercel project, open **Storage** and add **Prisma Postgres**. This sets `DATABASE_URL`, which the app uses for queries and migrations. Tick the Development environment too if you want `vercel env pull` to work locally.
4. **Environment variables.** Set `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `ALLOWED_EMAILS` (see `.env.example`).
5. **Redeploy.** The `vercel-build` script runs `prisma migrate deploy` before building, so the database schema stays in step with each deploy.

GitHub Actions (`.github/workflows/ci.yml`) lints, typechecks, checks that migrations apply and match the schema, and builds on every push and PR.

> While the Google OAuth app is in "Testing" mode, Google expires refresh tokens after 7 days, so you'll need to sign in again weekly. Publishing the app (no verification is needed for a single user who accepts the warning) removes that limit.

> Preview deployments use the same database as production (the integration connects both). Any PR that changes the schema will migrate the shared database when its preview builds, so be careful with destructive migrations, or connect a separate database to Preview.

## Local development

```bash
npm install
cp .env.example .env   # or: vercel link && vercel env pull .env
npx prisma migrate deploy
npm run dev
```

Leave `GOOGLE_CLIENT_ID` blank to use demo mode with sample emails: an Inbox, a client label (`Clients/Acme`) with two project sub-labels, and some mail archived under labels. Demo mode still needs the database.

To change the schema, edit `prisma/schema.prisma` and then run `npm run db:migrate -- --name <change>`. Commit the generated migration.
