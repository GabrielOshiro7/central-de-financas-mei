-- CreateEnum
CREATE TYPE "recurrence_frequency" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');

-- AlterEnum
ALTER TYPE "entry_source" ADD VALUE 'RECURRING';

-- AlterTable
ALTER TABLE "financial_entries" ADD COLUMN     "recurring_entry_id" TEXT;

-- CreateTable
CREATE TABLE "recurring_entries" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "type" "financial_entry_type" NOT NULL,
    "category_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "frequency" "recurrence_frequency" NOT NULL,
    "day_of_week" INTEGER,
    "day_of_month" INTEGER,
    "year_month" INTEGER,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_entries_business_id_is_active_idx" ON "recurring_entries"("business_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "financial_entries_recurring_entry_id_occurred_at_key" ON "financial_entries"("recurring_entry_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_recurring_entry_id_fkey" FOREIGN KEY ("recurring_entry_id") REFERENCES "recurring_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_entries" ADD CONSTRAINT "recurring_entries_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_entries" ADD CONSTRAINT "recurring_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

