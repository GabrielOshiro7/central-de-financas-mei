BEGIN;

-- Etapa F6d (contrair): remove as colunas de instante que viraram redundantes
-- com os dias de calendario (_on) das etapas F6a-F6c. Ficam: bills.paid_at
-- (instante de auditoria), bills/financial_entries.occurrence_date
-- (idempotencia da F5), todas as colunas _on e as datas da Agenda.
--
-- Rollback (manual; recria as colunas a partir dos dias - o DIA e o mesmo,
-- mas o instante original NAO volta: vira 00:00 do dia no fuso da empresa,
-- como startOfDayInstant):
--   BEGIN;
--   ALTER TABLE "financial_entries" ADD COLUMN "occurred_at" TIMESTAMP(3);
--   ALTER TABLE "businesses" ADD COLUMN "opening_balance_date" TIMESTAMP(3);
--   ALTER TABLE "bills" ADD COLUMN "due_date" TIMESTAMP(3), ADD COLUMN "issue_date" TIMESTAMP(3);
--   ALTER TABLE "recurring_bills" ADD COLUMN "start_date" TIMESTAMP(3), ADD COLUMN "end_date" TIMESTAMP(3);
--   ALTER TABLE "sales" ADD COLUMN "sale_date" TIMESTAMP(3);
--   ALTER TABLE "recurring_entries" ADD COLUMN "start_date" TIMESTAMP(3), ADD COLUMN "end_date" TIMESTAMP(3);
--   UPDATE "financial_entries" t SET "occurred_at" = (t."occurred_on"::timestamp AT TIME ZONE b."timezone") AT TIME ZONE 'UTC' FROM "businesses" b WHERE b."id" = t."business_id";
--   UPDATE "businesses" SET "opening_balance_date" = ("opening_balance_on"::timestamp AT TIME ZONE "timezone") AT TIME ZONE 'UTC';
--   UPDATE "bills" t SET "due_date" = (t."due_on"::timestamp AT TIME ZONE b."timezone") AT TIME ZONE 'UTC', "issue_date" = (t."issue_on"::timestamp AT TIME ZONE b."timezone") AT TIME ZONE 'UTC' FROM "businesses" b WHERE b."id" = t."business_id";
--   UPDATE "recurring_bills" t SET "start_date" = (t."start_on"::timestamp AT TIME ZONE b."timezone") AT TIME ZONE 'UTC', "end_date" = (t."end_on"::timestamp AT TIME ZONE b."timezone") AT TIME ZONE 'UTC' FROM "businesses" b WHERE b."id" = t."business_id";
--   UPDATE "sales" t SET "sale_date" = (t."sale_on"::timestamp AT TIME ZONE b."timezone") AT TIME ZONE 'UTC' FROM "businesses" b WHERE b."id" = t."business_id";
--   UPDATE "recurring_entries" t SET "start_date" = (t."start_on"::timestamp AT TIME ZONE b."timezone") AT TIME ZONE 'UTC', "end_date" = (t."end_on"::timestamp AT TIME ZONE b."timezone") AT TIME ZONE 'UTC' FROM "businesses" b WHERE b."id" = t."business_id";
--   ALTER TABLE "financial_entries" ALTER COLUMN "occurred_at" SET NOT NULL;
--   ALTER TABLE "bills" ALTER COLUMN "due_date" SET NOT NULL;
--   ALTER TABLE "recurring_bills" ALTER COLUMN "start_date" SET NOT NULL;
--   ALTER TABLE "sales" ALTER COLUMN "sale_date" SET NOT NULL;
--   ALTER TABLE "recurring_entries" ALTER COLUMN "start_date" SET NOT NULL;
--   CREATE INDEX "financial_entries_business_id_occurred_at_idx" ON "financial_entries"("business_id", "occurred_at");
--   CREATE INDEX "bills_business_id_due_date_idx" ON "bills"("business_id", "due_date");
--   CREATE INDEX "sales_business_id_sale_date_idx" ON "sales"("business_id", "sale_date");
--   DROP INDEX "financial_entries_business_id_occurred_on_idx";
--   DROP INDEX "bills_business_id_due_on_idx";
--   DROP INDEX "sales_business_id_sale_on_idx";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261102100000_calendar_day_contract';
--   COMMIT;
-- (e voltar o schema.prisma/codigo para o commit anterior a F6d)

-- 1. Verificacao SOMENTE LEITURA, antes de qualquer DROP: cada coluna _on e
-- o dia da coluna antiga no fuso da empresa (timestamps guardam UTC sem fuso)
-- e a nulidade concorda (IS DISTINCT FROM trata NULL x valor como
-- divergencia). Qualquer divergencia aborta e desfaz a transacao inteira.
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM "financial_entries" t JOIN "businesses" b ON b."id" = t."business_id"
  WHERE t."occurred_on" IS DISTINCT FROM (t."occurred_at" AT TIME ZONE 'UTC' AT TIME ZONE b."timezone")::date;
  IF n > 0 THEN RAISE EXCEPTION 'F6d: % financial_entries com occurred_on diferente do dia de occurred_at', n; END IF;

  SELECT count(*) INTO n FROM "businesses"
  WHERE "opening_balance_on" IS DISTINCT FROM ("opening_balance_date" AT TIME ZONE 'UTC' AT TIME ZONE "timezone")::date;
  IF n > 0 THEN RAISE EXCEPTION 'F6d: % businesses com opening_balance_on diferente do dia de opening_balance_date', n; END IF;

  SELECT count(*) INTO n FROM "bills" t JOIN "businesses" b ON b."id" = t."business_id"
  WHERE t."due_on" IS DISTINCT FROM (t."due_date" AT TIME ZONE 'UTC' AT TIME ZONE b."timezone")::date
     OR t."issue_on" IS DISTINCT FROM (t."issue_date" AT TIME ZONE 'UTC' AT TIME ZONE b."timezone")::date;
  IF n > 0 THEN RAISE EXCEPTION 'F6d: % bills com due_on/issue_on diferente do dia de due_date/issue_date', n; END IF;

  SELECT count(*) INTO n FROM "recurring_bills" t JOIN "businesses" b ON b."id" = t."business_id"
  WHERE t."start_on" IS DISTINCT FROM (t."start_date" AT TIME ZONE 'UTC' AT TIME ZONE b."timezone")::date
     OR t."end_on" IS DISTINCT FROM (t."end_date" AT TIME ZONE 'UTC' AT TIME ZONE b."timezone")::date;
  IF n > 0 THEN RAISE EXCEPTION 'F6d: % recurring_bills com start_on/end_on diferente do dia de start_date/end_date', n; END IF;

  SELECT count(*) INTO n FROM "sales" t JOIN "businesses" b ON b."id" = t."business_id"
  WHERE t."sale_on" IS DISTINCT FROM (t."sale_date" AT TIME ZONE 'UTC' AT TIME ZONE b."timezone")::date;
  IF n > 0 THEN RAISE EXCEPTION 'F6d: % sales com sale_on diferente do dia de sale_date', n; END IF;

  SELECT count(*) INTO n FROM "recurring_entries" t JOIN "businesses" b ON b."id" = t."business_id"
  WHERE t."start_on" IS DISTINCT FROM (t."start_date" AT TIME ZONE 'UTC' AT TIME ZONE b."timezone")::date
     OR t."end_on" IS DISTINCT FROM (t."end_date" AT TIME ZONE 'UTC' AT TIME ZONE b."timezone")::date;
  IF n > 0 THEN RAISE EXCEPTION 'F6d: % recurring_entries com start_on/end_on diferente do dia de start_date/end_date', n; END IF;
END $$;

-- 2. Indices equivalentes sobre os dias, antes de remover os antigos.
CREATE INDEX "financial_entries_business_id_occurred_on_idx" ON "financial_entries"("business_id", "occurred_on");
CREATE INDEX "bills_business_id_due_on_idx" ON "bills"("business_id", "due_on");
CREATE INDEX "sales_business_id_sale_on_idx" ON "sales"("business_id", "sale_on");

-- 3. Indices antigos.
DROP INDEX "financial_entries_business_id_occurred_at_idx";
DROP INDEX "bills_business_id_due_date_idx";
DROP INDEX "sales_business_id_sale_date_idx";

-- 4. Colunas antigas.
ALTER TABLE "financial_entries" DROP COLUMN "occurred_at";
ALTER TABLE "businesses" DROP COLUMN "opening_balance_date";
ALTER TABLE "bills" DROP COLUMN "due_date", DROP COLUMN "issue_date";
ALTER TABLE "recurring_bills" DROP COLUMN "start_date", DROP COLUMN "end_date";
ALTER TABLE "sales" DROP COLUMN "sale_date";
ALTER TABLE "recurring_entries" DROP COLUMN "start_date", DROP COLUMN "end_date";

COMMIT;
