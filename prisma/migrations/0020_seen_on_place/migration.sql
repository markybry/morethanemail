-- Cards never opened in the app had no "seen" time, so replies to them never
-- showed as new. Count each as seen up to when it came into its status (or its
-- latest message, if that's earlier): anything newer than that is a new reply.

-- Cards in a status.
UPDATE "Email" e
SET "lastSeenAt" = LEAST(e."date", p."movedAt")
FROM "Placement" p
WHERE p."emailId" = e."id" AND e."lastSeenAt" IS NULL;

-- Emails added to a card: seen up to when the card came into its status.
UPDATE "Email" e
SET "lastSeenAt" = LEAST(e."date", p."movedAt")
FROM "Placement" p
WHERE p."emailId" = e."parentId" AND e."lastSeenAt" IS NULL;

-- Everything else: seen up to its latest message.
UPDATE "Email" SET "lastSeenAt" = "date" WHERE "lastSeenAt" IS NULL;
