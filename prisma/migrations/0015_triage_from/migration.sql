-- Labelled mail older than this date counts as done and stays out of the triage column.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "triageFrom" TIMESTAMP(3);

