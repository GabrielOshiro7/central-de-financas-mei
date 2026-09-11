-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "opening_balance_date" TIMESTAMP(3);
