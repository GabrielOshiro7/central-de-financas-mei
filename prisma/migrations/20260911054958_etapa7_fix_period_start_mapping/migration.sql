/*
  Warnings:

  - You are about to drop the column `periodStart` on the `insights` table. All the data in the column will be lost.
  - Added the required column `period_start` to the `insights` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "insights" DROP COLUMN "periodStart",
ADD COLUMN     "period_start" TIMESTAMP(3) NOT NULL;
