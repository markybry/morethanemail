-- One workflow: a card sits in at most one status, and labels are lenses on the
-- workflow rather than workspaces of their own.

-- Start clean. Nothing was in live use, so every old label workspace goes, with
-- its lanes, placements, no-email tickets and their activity. Emails' notes,
-- tasks and links are kept. The workflow is recreated, with default statuses,
-- the first time it is opened.
DELETE FROM "Workspace";

-- Each card remembers its Gmail labels, so a label's view can filter instantly.
ALTER TABLE "Email" ADD COLUMN     "labelIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- DropIndex
DROP INDEX "Placement_workspaceId_emailId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Placement_emailId_key" ON "Placement"("emailId");
