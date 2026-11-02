BEGIN;

-- Etapa F6c (expandir): dias de calendario ao lado dos instantes de vendas e
-- lancamentos recorrentes, sem tocar nas colunas antigas. Sufixo _on = dia
-- (DATE), _at/_date = instante. O app grava as duas e, na mesma etapa, passa a
-- ler so as novas; as antigas saem na F6d.
-- Rollback (manual; as colunas antigas nunca mudam):
--   BEGIN;
--   ALTER TABLE "sales" DROP COLUMN "sale_on";
--   ALTER TABLE "recurring_entries" DROP COLUMN "start_on", DROP COLUMN "end_on";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '<esta pasta>';
--   COMMIT;

-- Contagens de antes, para a verificacao (3): parametros LOCAIS da transacao.
SELECT set_config('f6c.sales', (SELECT count(*) FROM "sales")::text, true),
       set_config('f6c.rentries', (SELECT count(*) FROM "recurring_entries")::text, true);

-- 1. Colunas novas (as obrigatorias so recebem NOT NULL depois do backfill).
ALTER TABLE "sales" ADD COLUMN "sale_on" DATE;
ALTER TABLE "recurring_entries" ADD COLUMN "start_on" DATE;
ALTER TABLE "recurring_entries" ADD COLUMN "end_on" DATE;

-- 2. Backfill: dia de calendario do instante no fuso da empresa dona da
-- linha (timestamps guardam UTC sem fuso). NULL continua NULL.
UPDATE "sales" s
SET "sale_on" = (s."sale_date" AT TIME ZONE 'UTC' AT TIME ZONE b."timezone")::date
FROM "businesses" b
WHERE b."id" = s."business_id";

UPDATE "recurring_entries" r
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
  SELECT count(*) INTO n FROM "sales" WHERE "sale_on" IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'F6c: % sales com sale_on NULL apos o backfill', n; END IF;
  SELECT count(*) INTO n FROM "recurring_entries" WHERE "start_on" IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'F6c: % recurring_entries com start_on NULL apos o backfill', n; END IF;
  SELECT count(*) INTO n FROM "recurring_entries" WHERE ("end_date" IS NULL) <> ("end_on" IS NULL);
  IF n > 0 THEN RAISE EXCEPTION 'F6c: % recurring_entries com end_on e end_date em desacordo (NULL x nao NULL)', n; END IF;
  IF (SELECT count(*) FROM "sales") <> current_setting('f6c.sales')::bigint
     OR (SELECT count(*) FROM "recurring_entries") <> current_setting('f6c.rentries')::bigint THEN
    RAISE EXCEPTION 'F6c: contagens mudaram durante a migracao';
  END IF;
END $$;

-- 4. Obrigatorias como as colunas antigas correspondentes.
ALTER TABLE "sales" ALTER COLUMN "sale_on" SET NOT NULL;
ALTER TABLE "recurring_entries" ALTER COLUMN "start_on" SET NOT NULL;

COMMIT;
