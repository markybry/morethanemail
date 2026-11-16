-- A due date can carry a time of day.

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "dueTime" BOOLEAN NOT NULL DEFAULT false;
