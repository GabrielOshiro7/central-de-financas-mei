BEGIN;

-- Estado de leitura dos insights por usuario (lido/nao lido). Aditiva: so CREATE
-- TABLE + CREATE INDEX + FKs; nenhuma tabela existente e alterada. A chave do insight
-- ("<metrica em minusculas>:<periodo yyyy-mm>", ex.: "expense_growth:2026-11") e
-- calculada pelo app, estavel entre recalculos dos insights. Existir uma linha = lido.
--
-- Rollback (manual; so perde o estado lido/nao lido):
--   BEGIN;
--   DROP TABLE "insight_reads";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261113110000_insight_reads';
--   COMMIT;

-- 0. Contagens e hash das tabelas vizinhas, antes de qualquer mudanca (parametros
-- LOCAIS da transacao - so leitura).
SELECT set_config('ir.users', (SELECT count(*) FROM "users")::text, true),
       set_config('ir.businesses', (SELECT count(*) FROM "businesses")::text, true),
       set_config('ir.insights', (SELECT count(*) FROM "insights")::text, true),
       set_config('ir.h_insights', (SELECT coalesce(md5(string_agg(row(t.*)::text, '|' ORDER BY t.id)), '') FROM "insights" t), true),
       set_config('ir.h_users', (SELECT coalesce(md5(string_agg(row(t.*)::text, '|' ORDER BY t.id)), '') FROM "users" t), true);

-- 1. Tabela, indices e chaves estrangeiras.
CREATE TABLE "insight_reads" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "insight_key" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insight_reads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "insight_reads_business_id_idx" ON "insight_reads"("business_id");
CREATE UNIQUE INDEX "insight_reads_user_id_business_id_insight_key_key" ON "insight_reads"("user_id", "business_id", "insight_key");

ALTER TABLE "insight_reads" ADD CONSTRAINT "insight_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insight_reads" ADD CONSTRAINT "insight_reads_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Verificacao SOMENTE LEITURA: aborta (e desfaz tudo) se alguma contagem mudou, se
-- users/insights mudaram de valor (hash), se a tabela nova nao nasceu vazia ou se
-- indices/chaves nao ficaram como esperado.
DO $$
DECLARE
  n integer;
BEGIN
  IF (SELECT count(*) FROM "users") <> current_setting('ir.users')::bigint
     OR (SELECT count(*) FROM "businesses") <> current_setting('ir.businesses')::bigint
     OR (SELECT count(*) FROM "insights") <> current_setting('ir.insights')::bigint THEN
    RAISE EXCEPTION 'insight_reads: contagens mudaram durante a migracao';
  END IF;
  IF (SELECT coalesce(md5(string_agg(row(t.*)::text, '|' ORDER BY t.id)), '') FROM "insights" t) <> current_setting('ir.h_insights')
     OR (SELECT coalesce(md5(string_agg(row(t.*)::text, '|' ORDER BY t.id)), '') FROM "users" t) <> current_setting('ir.h_users') THEN
    RAISE EXCEPTION 'insight_reads: insights/users mudaram de valor (hash diferente)';
  END IF;
  SELECT count(*) INTO n FROM "insight_reads";
  IF n <> 0 THEN RAISE EXCEPTION 'insight_reads: tabela nova nao nasceu vazia (%)', n; END IF;
  IF (SELECT count(*) FROM pg_indexes WHERE tablename = 'insight_reads' AND indexname IN ('insight_reads_pkey', 'insight_reads_business_id_idx', 'insight_reads_user_id_business_id_insight_key_key')) <> 3 THEN
    RAISE EXCEPTION 'insight_reads: indices inesperados';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'insight_reads'::regclass AND contype = 'f') <> 2 THEN
    RAISE EXCEPTION 'insight_reads: chaves estrangeiras inesperadas';
  END IF;
END $$;

COMMIT;
