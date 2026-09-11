-- Rollback for 20260910100500_etapa5_1_opening_balance
-- Not executed automatically by Prisma - run manually (and a corresponding
-- "down" step / prisma migrate resolve) only if you actually need to revert
-- this migration. Safe at any time: both columns are purely additive
-- (opening_balance defaults to 0, opening_balance_date is nullable), so no
-- other table/column depends on them and no data loss occurs elsewhere.

BEGIN;

ALTER TABLE "businesses" DROP COLUMN "opening_balance_date";
ALTER TABLE "businesses" DROP COLUMN "opening_balance";

COMMIT;
