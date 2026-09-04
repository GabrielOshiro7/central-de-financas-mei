-- CreateEnum
CREATE TYPE "business_type" AS ENUM ('RESTAURANTE', 'LOJA', 'SERVICOS', 'CONSTRUCAO', 'ECOMMERCE', 'ACADEMIA', 'OUTRO');

-- CreateEnum
CREATE TYPE "years_in_business" AS ENUM ('MENOS_DE_1_ANO', 'DE_1_A_3_ANOS', 'DE_3_A_5_ANOS', 'DE_5_A_10_ANOS', 'MAIS_DE_10_ANOS');

-- CreateEnum
CREATE TYPE "currency" AS ENUM ('JPY', 'BRL', 'USD');

-- CreateEnum
CREATE TYPE "financial_entry_type" AS ENUM ('REVENUE', 'COST', 'EXPENSE');

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT,
    "business_type" "business_type",
    "revenue_model" TEXT[],
    "revenue_model_other" TEXT,
    "years_in_business" "years_in_business",
    "employee_count" INTEGER,
    "currency" "currency",
    "average_monthly_revenue" DECIMAL(14,2),
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "onboarding_step" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_entries" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "type" "financial_entry_type" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "businesses_user_id_key" ON "businesses"("user_id");

-- CreateIndex
CREATE INDEX "financial_entries_business_id_occurred_at_idx" ON "financial_entries"("business_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
