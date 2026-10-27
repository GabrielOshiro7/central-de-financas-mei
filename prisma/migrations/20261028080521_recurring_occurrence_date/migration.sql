-- Etapa F5 (docs/plano-retrabalho-fuso-agenda.md, secao 3.4): chave de
-- idempotencia dos recorrentes por DIA DE CALENDARIO no fuso da empresa,
-- no lugar do instante. Aditiva: so adiciona colunas, preenche, verifica e
-- troca o indice unico. Rollback (manual, ver plano 3.4):
--   CREATE UNIQUE INDEX "financial_entries_recurring_entry_id_occurred_at_key" ON "financial_entries"("recurring_entry_id", "occurred_at");
--   CREATE UNIQUE INDEX "bills_recurring_bill_id_due_date_key" ON "bills"("recurring_bill_id", "due_date");
--   DROP INDEX "financial_entries_recurring_entry_id_occurrence_date_key";
--   DROP INDEX "bills_recurring_bill_id_occurrence_date_key";
--   ALTER TABLE "financial_entries" DROP COLUMN "occurrence_date";
--   ALTER TABLE "bills" DROP COLUMN "occurrence_date";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '<esta pasta>';

-- Transacao explicita: se a pre-checagem (3) abortar, nada fica pela metade.
BEGIN;

-- 1. Colunas novas (nulas: so linhas geradas por molde sao preenchidas).
ALTER TABLE "financial_entries" ADD COLUMN "occurrence_date" DATE;
ALTER TABLE "bills" ADD COLUMN "occurrence_date" DATE;

-- 2. Backfill: dia de calendario do instante gravado, no fuso da empresa
-- dona da linha. As colunas timestamp guardam UTC sem fuso.
UPDATE "financial_entries" fe
SET "occurrence_date" = (fe."occurred_at" AT TIME ZONE 'UTC' AT TIME ZONE b."timezone")::date
FROM "businesses" b
WHERE b."id" = fe."business_id" AND fe."recurring_entry_id" IS NOT NULL;

UPDATE "bills" bi
SET "occurrence_date" = (bi."due_date" AT TIME ZONE 'UTC' AT TIME ZONE b."timezone")::date
FROM "businesses" b
WHERE b."id" = bi."business_id" AND bi."recurring_bill_id" IS NOT NULL;

-- 3. Pre-checagem SOMENTE LEITURA: aborta a migracao (e o backfill acima,
-- na mesma transacao) se algum molde tiver duas linhas no mesmo dia.
DO $$
DECLARE
  fe_groups integer;
  bill_groups integer;
BEGIN
  SELECT count(*) INTO fe_groups FROM (
    SELECT 1 FROM "financial_entries"
    WHERE "recurring_entry_id" IS NOT NULL
    GROUP BY "recurring_entry_id", "occurrence_date" HAVING count(*) > 1
  ) d;
  SELECT count(*) INTO bill_groups FROM (
    SELECT 1 FROM "bills"
    WHERE "recurring_bill_id" IS NOT NULL
    GROUP BY "recurring_bill_id", "occurrence_date" HAVING count(*) > 1
  ) d;
  IF fe_groups > 0 OR bill_groups > 0 THEN
    RAISE EXCEPTION 'recurring_occurrence_date: % grupo(s) duplicado(s) em financial_entries e % em bills (molde, dia) - remova as duplicatas antes', fe_groups, bill_groups;
  END IF;
END $$;

-- 4. Unicidade nova por dia; depois remove a antiga (por instante).
CREATE UNIQUE INDEX "financial_entries_recurring_entry_id_occurrence_date_key" ON "financial_entries"("recurring_entry_id", "occurrence_date");
CREATE UNIQUE INDEX "bills_recurring_bill_id_occurrence_date_key" ON "bills"("recurring_bill_id", "occurrence_date");

DROP INDEX "financial_entries_recurring_entry_id_occurred_at_key";
DROP INDEX "bills_recurring_bill_id_due_date_key";

COMMIT;
