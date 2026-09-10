-- CreateEnum
CREATE TYPE "bill_status" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "recurring_bill_frequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY');

-- AlterEnum
ALTER TYPE "entry_source" ADD VALUE 'BILL';

-- AlterTable
ALTER TABLE "financial_entries" ADD COLUMN     "bill_id" TEXT;

-- CreateTable
CREATE TABLE "bills" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "issue_date" TIMESTAMP(3),
    "due_date" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "status" "bill_status" NOT NULL DEFAULT 'PENDING',
    "document_number" TEXT,
    "counterparty_name" TEXT,
    "payment_method" TEXT,
    "bank_account" TEXT,
    "cost_center" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "recurring_bill_id" TEXT,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_bills" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "frequency" "recurring_bill_frequency" NOT NULL,
    "day_of_week" INTEGER,
    "day_of_month" INTEGER,
    "year_month" INTEGER,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "document_number" TEXT,
    "counterparty_name" TEXT,
    "payment_method" TEXT,
    "bank_account" TEXT,
    "cost_center" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_bills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bills_business_id_status_idx" ON "bills"("business_id", "status");

-- CreateIndex
CREATE INDEX "bills_business_id_due_date_idx" ON "bills"("business_id", "due_date");

-- CreateIndex
CREATE INDEX "bills_category_id_idx" ON "bills"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "bills_recurring_bill_id_due_date_key" ON "bills"("recurring_bill_id", "due_date");

-- CreateIndex
CREATE INDEX "recurring_bills_business_id_is_active_idx" ON "recurring_bills"("business_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "financial_entries_bill_id_key" ON "financial_entries"("bill_id");

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_recurring_bill_id_fkey" FOREIGN KEY ("recurring_bill_id") REFERENCES "recurring_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
