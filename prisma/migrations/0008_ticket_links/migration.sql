-- Links kept with a ticket.
-- CreateTable
CREATE TABLE "TicketLink" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketLink_emailId_idx" ON "TicketLink"("emailId");

-- AddForeignKey
ALTER TABLE "TicketLink" ADD CONSTRAINT "TicketLink_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;

