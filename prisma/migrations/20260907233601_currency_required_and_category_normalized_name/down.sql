-- ROLLBACK manual desta migration.
--
-- O Prisma Migrate NAO roda down-migrations automaticamente (nao existe
-- "prisma migrate down" - é uma limitacao conhecida da ferramenta, nao uma
-- omissao deste projeto). Para reverter esta migration especifica:
--
--   docker compose exec -T db psql -U app -d app_db < prisma/migrations/20260907233601_currency_required_and_category_normalized_name/down.sql
--
-- E depois remova manualmente a linha correspondente da tabela
-- _prisma_migrations (ou rode `prisma migrate resolve --rolled-back
-- 20260907233601_currency_required_and_category_normalized_name`) para o
-- Prisma parar de considerar essa migration como aplicada.
--
-- Este rollback NAO tenta restaurar os valores originais de currency=NULL
-- nem o estado exato de name/normalized_name anterior - ele so desfaz a
-- estrutura (colunas/constraints). Se precisar dos dados exatamente como
-- estavam antes, restaure o dump feito antes desta migration em vez de
-- rodar este script (ver relatorio da Etapa 3.1 para o caminho do dump).

-- ===== categories.normalized_name =====

DROP INDEX IF EXISTS "categories_business_id_type_normalized_name_key";
CREATE UNIQUE INDEX "categories_business_id_type_name_key"
  ON "categories" ("business_id", "type", "name");

ALTER TABLE "categories" DROP COLUMN "normalized_name";

-- ===== businesses.currency =====

ALTER TABLE "businesses" ALTER COLUMN "currency" DROP NOT NULL;
ALTER TABLE "businesses" ALTER COLUMN "currency" DROP DEFAULT;
-- Nao reverte os valores que foram preenchidos com 'BRL' pela migration de
-- ida (essa informacao - quais linhas eram NULL antes - nao fica registrada
-- em lugar nenhum). Restaure o dump se isso importar.
