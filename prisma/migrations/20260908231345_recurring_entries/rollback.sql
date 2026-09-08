-- Rollback for 20260908231345_recurring_entries
-- Not executed automatically by Prisma - run manually (and re-add a
-- corresponding "down" migration folder / prisma migrate resolve step) only
-- if you actually need to revert this migration.
--
-- IMPORTANT: run this BEFORE reverting the application code, and only if no
-- financial_entries row has source = 'RECURRING' (see the note near the end
-- about entry_source - Postgres cannot simply remove an enum value).

BEGIN;

ALTER TABLE "recurring_entries" DROP CONSTRAINT "recurring_entries_category_id_fkey";
ALTER TABLE "recurring_entries" DROP CONSTRAINT "recurring_entries_business_id_fkey";
ALTER TABLE "financial_entries" DROP CONSTRAINT "financial_entries_recurring_entry_id_fkey";

DROP INDEX "financial_entries_recurring_entry_id_occurred_at_key";
DROP INDEX "recurring_entries_business_id_is_active_idx";

DROP TABLE "recurring_entries";

ALTER TABLE "financial_entries" DROP COLUMN "recurring_entry_id";

DROP TYPE "recurrence_frequency";

COMMIT;

-- Postgres does not support removing a single value from an existing enum
-- type. To fully revert entry_source back to (MANUAL, IMPORT) only:
--   1) Confirm no financial_entries row has source = 'RECURRING' (if any
--      do, you must delete/reassign them first - dropping the value would
--      otherwise orphan those rows).
--   2) Then, in a separate transaction:
--      CREATE TYPE "entry_source_old" AS ENUM ('MANUAL', 'IMPORT');
--      ALTER TABLE "financial_entries"
--        ALTER COLUMN "source" TYPE "entry_source_old"
--        USING ("source"::text::"entry_source_old");
--      DROP TYPE "entry_source";
--      ALTER TYPE "entry_source_old" RENAME TO "entry_source";
-- Deliberately not automated here - it is destructive if any RECURRING rows
-- exist and must be a conscious, separate decision.
