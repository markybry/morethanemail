-- When the user last opened an email, for "Recently opened" on Today.

-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "openedAt" TIMESTAMP(3);
