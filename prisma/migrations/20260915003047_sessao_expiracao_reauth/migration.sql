-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "elevated_until" TIMESTAMP(3),
ADD COLUMN     "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
