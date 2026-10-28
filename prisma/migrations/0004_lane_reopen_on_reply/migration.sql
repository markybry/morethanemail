-- Lanes can send an email back to unsorted when a new reply arrives (e.g. Done, Waiting).
-- AlterTable
ALTER TABLE "Lane" ADD COLUMN     "reopenOnReply" BOOLEAN NOT NULL DEFAULT false;

