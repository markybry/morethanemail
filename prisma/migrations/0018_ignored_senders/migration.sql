-- Senders whose mail is kept out of the Inbox column.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ignoredSenders" TEXT[] DEFAULT ARRAY[]::TEXT[];
