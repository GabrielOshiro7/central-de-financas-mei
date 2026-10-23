-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'JP',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Tokyo';
