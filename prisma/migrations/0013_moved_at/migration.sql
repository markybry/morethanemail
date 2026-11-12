-- When each card came into its status, for ages on cards and clearing old finished ones.

-- AlterTable
ALTER TABLE "Placement" ADD COLUMN     "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

