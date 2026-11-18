-- Google Calendar events linked to cards.
CREATE TABLE "CardEvent" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "htmlLink" TEXT NOT NULL DEFAULT '',
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CardEvent_emailId_eventId_key" ON "CardEvent"("emailId", "eventId");
CREATE INDEX "CardEvent_emailId_idx" ON "CardEvent"("emailId");

ALTER TABLE "CardEvent" ADD CONSTRAINT "CardEvent_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;
