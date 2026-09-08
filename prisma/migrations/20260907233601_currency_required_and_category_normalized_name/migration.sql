-- Etapa 3.1 (Bug 1 + Bug/Melhoria 2)
--
-- 1) businesses.currency vira obrigatoria (nunca mais NULL). Empresas que
--    ainda nao terminaram o onboarding (sem moeda escolhida) recebem BRL
--    como valor provisorio - nao tem lancamento nenhum atrelado a elas
--    ainda (checado manualmente antes de escrever esta migration: 9 linhas
--    afetadas, 0 delas com financial_entries).
-- 2) categories ganha normalized_name (forma canonica sem acento/maiuscula/
--    espaco extra), backfilled a partir do name atual, e a constraint UNIQUE
--    passa a usar essa coluna em vez do name cru - protege contra "Frete" e
--    "frete" coexistirem, inclusive sob corrida (duas importacoes
--    simultaneas). 25 linhas afetadas, nenhuma colisao apos normalizar
--    (verificado manualmente antes desta migration).

-- ===== businesses.currency =====

UPDATE "businesses" SET "currency" = 'BRL' WHERE "currency" IS NULL;

ALTER TABLE "businesses" ALTER COLUMN "currency" SET DEFAULT 'BRL';
ALTER TABLE "businesses" ALTER COLUMN "currency" SET NOT NULL;

-- ===== categories.normalized_name =====

ALTER TABLE "categories" ADD COLUMN "normalized_name" TEXT;

-- Replica normalizeCategoryName() (trim + colapsa espaco + minuscula +
-- remove acento) para as linhas ja existentes. Cobre os acentos usados nas
-- categorias padrao do sistema (a, e, i, o, u, c, n). Todo INSERT feito pela
-- aplicacao a partir de agora ja grava normalized_name calculado em JS -
-- este translate() e so para o backfill unico desta migration.
UPDATE "categories" SET "normalized_name" = translate(
  lower(trim(regexp_replace("name", '\s+', ' ', 'g'))),
  'áàãâäéèêëíìîïóòõôöúùûüçñÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ',
  'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
);

ALTER TABLE "categories" ALTER COLUMN "normalized_name" SET NOT NULL;

-- Troca a constraint unica: de (business_id, type, name) para
-- (business_id, type, normalized_name).
DROP INDEX IF EXISTS "categories_business_id_type_name_key";
CREATE UNIQUE INDEX "categories_business_id_type_normalized_name_key"
  ON "categories" ("business_id", "type", "normalized_name");
