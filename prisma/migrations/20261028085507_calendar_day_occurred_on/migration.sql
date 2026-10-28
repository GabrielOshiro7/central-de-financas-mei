BEGIN;

-- Etapa F6a-1 (expandir): dia de calendario ao lado dos instantes, sem tocar
-- nas colunas antigas. Sufixo _on = dia (DATE), _at = instante. O app grava
-- as duas colunas; ninguem le as novas ate a F6a-2; as antigas saem so na F6d.
-- Rollback (manual; as colunas antigas nunca mudam):
--   BEGIN;
--   ALTER TABLE "financial_entries" DROP COLUMN "occurred_on";
--   ALTER TABLE "businesses" DROP COLUMN "opening_balance_on";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '<esta pasta>';
--   COMMIT;

-- Contagens de antes, para a verificacao (3): guardadas em parametros LOCAIS
-- da transacao (set_config(..., true)) - so leitura, nada e criado/escrito.
SELECT set_config('f6a1.fe', (SELECT count(*) FROM "financial_entries")::text, true),
       set_config('f6a1.bz', (SELECT count(*) FROM "businesses")::text, true),
       set_config('f6a1.bz_with_date', (SELECT count(*) FROM "businesses" WHERE "opening_balance_date" IS NOT NULL)::text, true);

-- 1. Colunas novas (occurred_on anulavel so ate o SET NOT NULL abaixo).
ALTER TABLE "financial_entries" ADD COLUMN "occurred_on" DATE;
ALTER TABLE "businesses" ADD COLUMN "opening_balance_on" DATE;

-- 2. Backfill: dia de calendario do instante no fuso da empresa dona da
-- linha (as colunas timestamp guardam UTC sem fuso).
UPDATE "financial_entries" fe
SET "occurred_on" = (fe."occurred_at" AT TIME ZONE 'UTC' AT TIME ZONE b."timezone")::date
FROM "businesses" b
WHERE b."id" = fe."business_id";

UPDATE "businesses"
SET "opening_balance_on" = ("opening_balance_date" AT TIME ZONE 'UTC' AT TIME ZONE "timezone")::date
WHERE "opening_balance_date" IS NOT NULL;

-- 3. Verificacao SOMENTE LEITURA: aborta (e desfaz tudo acima) se o backfill
-- deixou buraco ou se alguma contagem mudou.
DO $$
DECLARE
  fe_null integer;
  bz_mismatch integer;
BEGIN
  SELECT count(*) INTO fe_null FROM "financial_entries" WHERE "occurred_on" IS NULL;
  SELECT count(*) INTO bz_mismatch FROM "businesses"
  WHERE ("opening_balance_date" IS NULL) <> ("opening_balance_on" IS NULL);
  IF fe_null > 0 THEN
    RAISE EXCEPTION 'F6a-1: % financial_entries com occurred_on NULL apos o backfill', fe_null;
  END IF;
  IF bz_mismatch > 0 THEN
    RAISE EXCEPTION 'F6a-1: % businesses com opening_balance_on e opening_balance_date em desacordo (NULL x nao NULL)', bz_mismatch;
  END IF;
  IF (SELECT count(*) FROM "financial_entries") <> current_setting('f6a1.fe')::bigint
     OR (SELECT count(*) FROM "businesses") <> current_setting('f6a1.bz')::bigint
     OR (SELECT count(*) FROM "businesses" WHERE "opening_balance_on" IS NOT NULL) <> current_setting('f6a1.bz_with_date')::bigint THEN
    RAISE EXCEPTION 'F6a-1: contagens mudaram durante a migracao';
  END IF;
END $$;

-- 4. occurred_on obrigatorio (todo lancamento tem dia).
ALTER TABLE "financial_entries" ALTER COLUMN "occurred_on" SET NOT NULL;

COMMIT;
