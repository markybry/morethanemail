-- Sent messages the user said need no reply: kept off "Waiting for a reply".

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notWaiting" TEXT[] DEFAULT ARRAY[]::TEXT[];
