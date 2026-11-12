-- Emails hidden from the first column until a newer message arrives.

-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "hiddenAt" TIMESTAMP(3);

