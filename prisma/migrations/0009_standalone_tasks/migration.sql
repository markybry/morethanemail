-- Tasks can stand alone (no email), so each task now records its owner.
-- Existing tasks take the owner of their email.
ALTER TABLE "Task" ADD COLUMN "userId" TEXT;
UPDATE "Task" SET "userId" = "Email"."userId" FROM "Email" WHERE "Email"."id" = "Task"."emailId";
ALTER TABLE "Task" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "Task" ALTER COLUMN "emailId" DROP NOT NULL;
ALTER TABLE "Task" ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "Task_userId_idx" ON "Task"("userId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
