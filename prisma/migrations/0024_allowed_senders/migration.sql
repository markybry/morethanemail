-- Senders whose mail from Gmail's other tabs (Updates, Promotions…) shows with
-- the Primary mail in the Inbox column instead of in the folded tray.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allowedSenders" TEXT[] DEFAULT ARRAY[]::TEXT[];
