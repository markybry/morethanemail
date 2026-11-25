-- Cards in a finished status (Done) stay on the board until archived.

-- AlterTable
ALTER TABLE "Placement" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- Cards already in a finished status were taken off the board when they got
-- there; keep them off (archived), so Done doesn't suddenly fill up.
UPDATE "Placement" p SET "archivedAt" = NOW() FROM "Lane" l WHERE p."laneId" = l."id" AND l."finished";
