-- A card can hold several email threads, and has its own title and summary.

-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "summary" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "title" TEXT;

-- CreateIndex
CREATE INDEX "Email_parentId_idx" ON "Email"("parentId");

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Email"("id") ON DELETE SET NULL ON UPDATE CASCADE;

