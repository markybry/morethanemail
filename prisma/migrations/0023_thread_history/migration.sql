-- Gmail version marker per stored thread, so refreshes fetch only changed threads.
ALTER TABLE "Email" ADD COLUMN "historyId" TEXT;
ALTER TABLE "Email" ADD COLUMN "unread" BOOLEAN NOT NULL DEFAULT false;
