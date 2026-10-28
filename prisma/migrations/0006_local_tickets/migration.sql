-- Tickets with no email belong to the workspace they were made in.
-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "workspaceId" TEXT;

-- CreateIndex
CREATE INDEX "Email_workspaceId_idx" ON "Email"("workspaceId");

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

