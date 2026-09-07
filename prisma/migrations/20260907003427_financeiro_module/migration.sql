/*
  Warnings:

  - Added the required column `category_id` to the `financial_entries` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `financial_entries` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `financial_entries` table without a default value. This is not possible if the table is not empty.
  - Made the column `description` on table `financial_entries` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "entry_source" AS ENUM ('MANUAL', 'IMPORT');

-- AlterTable
ALTER TABLE "financial_entries" ADD COLUMN     "category_id" TEXT NOT NULL,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "source" "entry_source" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "user_id" TEXT NOT NULL,
ALTER COLUMN "description" SET NOT NULL;

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "business_id" TEXT,
    "name" TEXT NOT NULL,
    "type" "financial_entry_type" NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "categories_business_id_type_idx" ON "categories"("business_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "categories_business_id_type_name_key" ON "categories"("business_id", "type", "name");

-- CreateIndex
CREATE INDEX "financial_entries_business_id_type_idx" ON "financial_entries"("business_id", "type");

-- CreateIndex
CREATE INDEX "financial_entries_category_id_idx" ON "financial_entries"("category_id");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
