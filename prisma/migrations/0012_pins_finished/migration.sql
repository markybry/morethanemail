-- Pinned labels on the user, and statuses that mean the work is finished.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pinnedLabels" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Lane" ADD COLUMN     "finished" BOOLEAN NOT NULL DEFAULT false;


-- Existing Done statuses are finished.
UPDATE "Lane" SET "finished" = true WHERE lower(trim("name")) = 'done';
