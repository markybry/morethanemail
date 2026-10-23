# More Than Email

An email client in the style of Sortd and Trello. The email is the root item:

1. **Email → Ticket.** Drag an email from the inbox onto a lane and it becomes a ticket.
2. **Ticket grows.** Link more email threads to it, add notes and tasks with due dates, rename it, and move it between lanes and workspaces. Split an email out into its own ticket if it turns into something separate.
3. **Ticket → Workspace.** "Promote to workspace" gives a ticket its own board. The ticket moves onto that board with everything attached, so nothing is copied or lost. A workspace is just a set of connected tickets, whether it's a project, a case or an investigation.

"My tasks" lists every task across all tickets, grouped by due date.

The left sidebar shows your Gmail labels as a nested tree (`Parent/Child` names) with unread counts, with Inbox at the top. Clicking one opens it in the inbox column, which works as a triage queue. Inbox shows Gmail's **Primary** tab by default, with a switch to all tabs. Emails already filed into a ticket are hidden until someone replies. A new reply brings the thread back marked "↩ New reply" and flags its ticket on the board. Search looks across all mail.

(In the code and database, workspaces are `Project` and tickets are `Card`.)

Stack: Next.js 15 (App Router, server actions) · Prisma + Postgres · Gmail API (read-only) · dnd-kit · Tailwind.

## Deploy (GitHub → Vercel)

1. **Google OAuth client.** In the [Google Cloud Console](https://console.cloud.google.com/):
   - Create a project, then enable the **Gmail API**.
   - On the **OAuth consent screen**, choose External and add yourself as a test user. Add the `gmail.readonly` scope.
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

Leave `GOOGLE_CLIENT_ID` blank to use demo mode with sample emails.

To change the schema, edit `prisma/schema.prisma` and then run `npm run db:migrate -- --name <change>`. Commit the generated migration.
