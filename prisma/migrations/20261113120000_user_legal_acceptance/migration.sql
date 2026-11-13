BEGIN;

-- Aceite dos Termos de Servico e da Politica de Privacidade no cadastro: data/hora e as
-- versoes aceitas, em users. Aditiva: so ADD COLUMN anulavel (sem default); usuarios
-- existentes ficam com NULL (a re-aceitacao sera decidida depois; ninguem e bloqueado).
--
-- Rollback (manual; so perde o registro de aceite):
--   BEGIN;
--   ALTER TABLE "users" DROP COLUMN "legal_accepted_at", DROP COLUMN "terms_version", DROP COLUMN "privacy_version";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261113120000_user_legal_acceptance';
--   COMMIT;

-- 0. Contagens e hash de TODAS as colunas que ja existem em users, antes de qualquer
-- mudanca (parametros LOCAIS da transacao - so leitura).
SELECT set_config('la.users', (SELECT count(*) FROM "users")::text, true),
       set_config('la.sessions', (SELECT count(*) FROM "sessions")::text, true),
       set_config('la.businesses', (SELECT count(*) FROM "businesses")::text, true),
       set_config('la.h_users', (SELECT coalesce(md5(string_agg(row(t.id, t.name, t.email, t.password_hash, t.created_at, t.updated_at, t.theme_preference)::text, '|' ORDER BY t.id)), '') FROM "users" t), true);

-- 1. Colunas novas (anulaveis, sem default).
ALTER TABLE "users" ADD COLUMN "legal_accepted_at" TIMESTAMP(3),
ADD COLUMN "terms_version" TEXT,
ADD COLUMN "privacy_version" TEXT;

-- 2. Verificacao SOMENTE LEITURA: aborta (e desfaz tudo) se alguma contagem mudou, se
-- algum valor das colunas existentes mudou (hash), se as colunas novas nao sao todas NULL
-- ou se tipo/nulabilidade/default ficaram diferentes do esperado.
DO $$
DECLARE
  n integer;
BEGIN
  IF (SELECT count(*) FROM "users") <> current_setting('la.users')::bigint
     OR (SELECT count(*) FROM "sessions") <> current_setting('la.sessions')::bigint
     OR (SELECT count(*) FROM "businesses") <> current_setting('la.businesses')::bigint THEN
    RAISE EXCEPTION 'aceite legal: contagens mudaram durante a migracao';
  END IF;
  IF (SELECT coalesce(md5(string_agg(row(t.id, t.name, t.email, t.password_hash, t.created_at, t.updated_at, t.theme_preference)::text, '|' ORDER BY t.id)), '') FROM "users" t) <> current_setting('la.h_users') THEN
    RAISE EXCEPTION 'aceite legal: alguma coluna existente de users mudou de valor (hash diferente)';
  END IF;
  SELECT count(*) INTO n FROM "users" WHERE "legal_accepted_at" IS NOT NULL OR "terms_version" IS NOT NULL OR "privacy_version" IS NOT NULL;
  IF n > 0 THEN RAISE EXCEPTION 'aceite legal: % usuarios com aceite preenchido', n; END IF;
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_name = 'users' AND is_nullable = 'YES' AND column_default IS NULL
        AND ((column_name = 'legal_accepted_at' AND data_type = 'timestamp without time zone')
          OR (column_name IN ('terms_version', 'privacy_version') AND data_type = 'text'))) <> 3 THEN
    RAISE EXCEPTION 'aceite legal: colunas ausentes ou com tipo/nulabilidade/default inesperados';
  END IF;
END $$;

COMMIT;
