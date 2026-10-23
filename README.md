# More Than Email

An email client in the style of Sortd and Trello. The email is the root item:

1. **Email → Case.** Drag an email from the inbox onto a lane and it becomes a case (a ticket).
2. **Case grows.** Link more email threads to it, add notes and tasks with due dates, rename it, move it between lanes and projects. Split an email out into its own case if it turns into something separate.
3. **Case → Project.** "Promote to project" gives a case its own board. The case moves onto that board with everything attached, so nothing is copied or lost. A project is just a set of connected cases.

"My tasks" lists every task across all cases, grouped by due date.

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
