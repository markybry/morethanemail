-- Every task now sits on a card. Tasks added on their own (the old My tasks
-- page) each get a filed ticket with no email, named after the task, in the
-- user's main workflow. Filed keeps them out of the first column.
INSERT INTO "Email" ("id", "userId", "workspaceId", "threadId", "subject", "from", "snippet", "date", "labelIds", "hiddenAt", "lastSeenAt", "createdAt")
SELECT
  'tk' || t."id",
  t."userId",
  (SELECT w."id" FROM "Workspace" w WHERE w."userId" = t."userId" AND w."labelId" = 'INBOX' LIMIT 1),
  'local:' || t."id",
  t."title",
  COALESCE(u."name", u."email"),
  '',
  t."createdAt",
  ARRAY[]::TEXT[],
  t."createdAt",
  t."createdAt",
  t."createdAt"
FROM "Task" t
JOIN "User" u ON u."id" = t."userId"
WHERE t."emailId" IS NULL;

UPDATE "Task" SET "emailId" = 'tk' || "id" WHERE "emailId" IS NULL;
