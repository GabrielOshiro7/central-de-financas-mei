BEGIN;

-- Etapa F6b-1 (expandir): dias de calendario ao lado dos instantes de contas
-- e contas recorrentes, sem tocar nas colunas antigas. Sufixo _on = dia
-- (DATE), _at/_date = instante. O app grava as duas; ninguem le as novas ate
-- a F6b-2; as antigas (exceto paid_at, instante de auditoria) saem na F6d.
-- Rollback (manual; as colunas antigas nunca mudam):
--   BEGIN;
--   ALTER TABLE "bills" DROP COLUMN "due_on", DROP COLUMN "issue_on", DROP COLUMN "paid_on";
--   ALTER TABLE "recurring_bills" DROP COLUMN "start_on", DROP COLUMN "end_on";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '<esta pasta>';
--   COMMIT;

-- Contagens de antes, para a verificacao (3): parametros LOCAIS da transacao.
SELECT set_config('f6b1.bills', (SELECT count(*) FROM "bills")::text, true),
       set_config('f6b1.rbills', (SELECT count(*) FROM "recurring_bills")::text, true);

-- 1. Colunas novas (as obrigatorias so recebem NOT NULL depois do backfill).
ALTER TABLE "bills" ADD COLUMN "due_on" DATE;
ALTER TABLE "bills" ADD COLUMN "issue_on" DATE;
ALTER TABLE "bills" ADD COLUMN "paid_on" DATE;
ALTER TABLE "recurring_bills" ADD COLUMN "start_on" DATE;
ALTER TABLE "recurring_bills" ADD COLUMN "end_on" DATE;

-- 2. Backfill: dia de calendario do instante no fuso da empresa dona da
-- linha (timestamps guardam UTC sem fuso). NULL continua NULL.
UPDATE "bills" bi
SET "due_on"   = (bi."due_date"   AT TIME ZONE 'UTC' AT TIME ZONE b."timezone")::date,
    "issue_on" = (bi."issue_date" AT TIME ZONE 'UTC' AT TIME ZONE b."timezone")::date,
    "paid_on"  = (bi."paid_at"    AT TIME ZONE 'UTC' AT TIME ZONE b."timezone")::date
FROM "businesses" b
WHERE b."id" = bi."business_id";

UPDATE "recurring_bills" r
SET "start_on" = (r."start_date" AT TIME ZONE 'UTC' AT TIME ZONE b."timezone")::date,
    "end_on"   = (r."end_date"   AT TIME ZONE 'UTC' AT TIME ZONE b."timezone")::date
FROM "businesses" b
WHERE b."id" = r."business_id";

-- 3. Verificacao SOMENTE LEITURA: aborta (e desfaz tudo acima) se o backfill
-- deixou buraco, se alguma coluna nova discorda da antiga quanto a NULL ou se
-- alguma contagem mudou.
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM "bills" WHERE "due_on" IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'F6b-1: % bills com due_on NULL apos o backfill', n; END IF;
  SELECT count(*) INTO n FROM "recurring_bills" WHERE "start_on" IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'F6b-1: % recurring_bills com start_on NULL apos o backfill', n; END IF;
  SELECT count(*) INTO n FROM "bills" WHERE ("paid_at" IS NULL) <> ("paid_on" IS NULL);
  IF n > 0 THEN RAISE EXCEPTION 'F6b-1: % bills com paid_on e paid_at em desacordo (NULL x nao NULL)', n; END IF;
  SELECT count(*) INTO n FROM "bills" WHERE ("issue_date" IS NULL) <> ("issue_on" IS NULL);
  IF n > 0 THEN RAISE EXCEPTION 'F6b-1: % bills com issue_on e issue_date em desacordo (NULL x nao NULL)', n; END IF;
  SELECT count(*) INTO n FROM "recurring_bills" WHERE ("end_date" IS NULL) <> ("end_on" IS NULL);
  IF n > 0 THEN RAISE EXCEPTION 'F6b-1: % recurring_bills com end_on e end_date em desacordo (NULL x nao NULL)', n; END IF;
  IF (SELECT count(*) FROM "bills") <> current_setting('f6b1.bills')::bigint
     OR (SELECT count(*) FROM "recurring_bills") <> current_setting('f6b1.rbills')::bigint THEN
    RAISE EXCEPTION 'F6b-1: contagens mudaram durante a migracao';
  END IF;
END $$;

-- 4. Obrigatorias como as colunas antigas correspondentes.
ALTER TABLE "bills" ALTER COLUMN "due_on" SET NOT NULL;
ALTER TABLE "recurring_bills" ALTER COLUMN "start_on" SET NOT NULL;

COMMIT;
