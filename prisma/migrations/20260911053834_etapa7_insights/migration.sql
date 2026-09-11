-- CreateEnum
CREATE TYPE "insight_category" AS ENUM ('PERFORMANCE', 'PROFITABILITY', 'CASH_FLOW', 'CLIENTS', 'SALES', 'RECEIVABLES');

-- CreateEnum
CREATE TYPE "insight_priority" AS ENUM ('INFO', 'ATTENTION', 'CRITICAL');

-- CreateEnum
CREATE TYPE "insight_metric" AS ENUM ('REVENUE_GROWTH', 'MARGIN_CHANGE', 'EXPENSE_GROWTH', 'TICKET_AVERAGE_CHANGE', 'RECEIVABLES_OVERDUE_CHANGE', 'CLIENT_CONCENTRATION', 'CLIENT_INACTIVITY');

-- CreateEnum
CREATE TYPE "variation_kind" AS ENUM ('PERCENT', 'POINTS');

-- CreateTable
CREATE TABLE "insights" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "category" "insight_category" NOT NULL,
    "metric" "insight_metric" NOT NULL,
    "priority" "insight_priority" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "recommendation" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "comparison_period_start" TIMESTAMP(3),
    "comparison_period_end" TIMESTAMP(3),
    "current_value" DECIMAL(14,2),
    "previous_value" DECIMAL(14,2),
    "variation_absolute" DECIMAL(14,2),
    "variation_percent" DECIMAL(7,4),
    "variation_kind" "variation_kind",
    "source" TEXT NOT NULL,
    "narrative_source" TEXT NOT NULL,
    "data_fingerprint" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "insights_business_id_period_key_idx" ON "insights"("business_id", "period_key");

-- CreateIndex
CREATE INDEX "insights_business_id_priority_idx" ON "insights"("business_id", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "insights_business_id_period_key_metric_key" ON "insights"("business_id", "period_key", "metric");

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
