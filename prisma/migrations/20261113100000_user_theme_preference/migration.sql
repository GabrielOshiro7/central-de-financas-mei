BEGIN;

-- Preferencia de tema do usuario (claro/escuro), guardada no banco para valer em
-- qualquer navegador/dispositivo. Aditiva: so CREATE TYPE + ADD COLUMN anulavel.
-- NULL = o usuario nunca escolheu => claro (padrao do app). Nenhuma linha existente
-- e alterada (todas ficam com NULL).
--
-- Rollback (manual; so perde a escolha de tema salva):
--   BEGIN;
--   ALTER TABLE "users" DROP COLUMN "theme_preference";
--   DROP TYPE "theme_preference";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261113100000_user_theme_preference';
--   COMMIT;

-- 0. Contagens e hash de TODAS as colunas que ja existem em users, antes de qualquer
-- mudanca (parametros LOCAIS da transacao - so leitura).
SELECT set_config('th.users', (SELECT count(*) FROM "users")::text, true),
       set_config('th.h_users', (SELECT coalesce(md5(string_agg(row(t.id, t.name, t.email, t.password_hash, t.created_at, t.updated_at)::text, '|' ORDER BY t.id)), '') FROM "users" t), true),
       set_config('th.sessions', (SELECT count(*) FROM "sessions")::text, true),
       set_config('th.businesses', (SELECT count(*) FROM "businesses")::text, true);

-- 1. Tipo e coluna (anulavel, sem default).
CREATE TYPE "theme_preference" AS ENUM ('LIGHT', 'DARK');
ALTER TABLE "users" ADD COLUMN "theme_preference" "theme_preference";

-- 2. Verificacao SOMENTE LEITURA: aborta (e desfaz tudo) se alguma contagem mudou, se
-- algum valor das colunas existentes mudou (hash), se a coluna nova nao e toda NULL ou
-- se o tipo/coluna nao ficou como esperado.
DO $$
DECLARE
  n integer;
BEGIN
  IF (SELECT count(*) FROM "users") <> current_setting('th.users')::bigint
     OR (SELECT count(*) FROM "sessions") <> current_setting('th.sessions')::bigint
     OR (SELECT count(*) FROM "businesses") <> current_setting('th.businesses')::bigint THEN
    RAISE EXCEPTION 'tema: contagens mudaram durante a migracao';
  END IF;
  IF (SELECT coalesce(md5(string_agg(row(t.id, t.name, t.email, t.password_hash, t.created_at, t.updated_at)::text, '|' ORDER BY t.id)), '') FROM "users" t) <> current_setting('th.h_users') THEN
    RAISE EXCEPTION 'tema: alguma coluna existente de users mudou de valor (hash diferente)';
  END IF;
  SELECT count(*) INTO n FROM "users" WHERE "theme_preference" IS NOT NULL;
  IF n > 0 THEN RAISE EXCEPTION 'tema: % usuarios com theme_preference preenchido', n; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'theme_preference' AND udt_name = 'theme_preference' AND is_nullable = 'YES' AND column_default IS NULL
  ) THEN
    RAISE EXCEPTION 'tema: coluna users.theme_preference ausente ou com tipo/nulabilidade/default inesperados';
  END IF;
  IF (SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'theme_preference') <> 'LIGHT,DARK' THEN
    RAISE EXCEPTION 'tema: valores do enum theme_preference inesperados';
  END IF;
END $$;

COMMIT;
