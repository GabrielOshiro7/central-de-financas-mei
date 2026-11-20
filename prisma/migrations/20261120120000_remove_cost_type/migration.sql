BEGIN;
-- Remove o tipo "Custo" (COST): tudo o que era custo passa a ser despesa (EXPENSE).
-- O enum financial_entry_type fica com REVENUE e EXPENSE. Colunas que usam o enum: categories.type,
-- financial_entries.type e recurring_entries.type (bills e recurring_bills nao tem coluna de tipo: a
-- direcao vem de category.type). Nada e apagado alem dos insights que dependem de custo (passo 3);
-- todo o resto e UPDATE de tipo. A transacao inteira aborta se qualquer verificacao do passo 5 falhar.

-- ============================================================================================
-- PASSO 0 - pre-condicao: nenhuma categoria COST pode colidir com uma EXPENSE de mesmo nome na
-- mesma empresa (o indice unico e business_id + type + normalized_name; apos converter, o tipo
-- deixa de diferenciar). Se houver QUALQUER colisao, aborta SEM fundir nada.
-- ============================================================================================
DO $$
DECLARE colisoes integer;
BEGIN
  SELECT count(*) INTO colisoes
  FROM categories a
  JOIN categories b
    ON a.id <> b.id
   AND a.business_id IS NOT DISTINCT FROM b.business_id
   AND a.normalized_name = b.normalized_name
   AND a.type = 'COST' AND b.type = 'EXPENSE';
  IF colisoes > 0 THEN
    RAISE EXCEPTION 'Migracao abortada: % colisao(oes) de categoria COST x EXPENSE (mesma empresa e mesmo nome). Nada foi alterado.', colisoes;
  END IF;
END $$;

-- ============================================================================================
-- PASSO 1 - guarda o "antes" em variaveis LOCAS da transacao (set_config(..., true)).
-- ============================================================================================
SELECT set_config('mig_rc.before_costexp',
  (SELECT coalesce(string_agg(business_id || ':' || n || ':' || s, ',' ORDER BY business_id), '')
     FROM (SELECT business_id, count(*) AS n, sum(amount) AS s
             FROM financial_entries WHERE type IN ('COST', 'EXPENSE') GROUP BY business_id) x), true);
SELECT set_config('mig_rc.before_revenue',
  (SELECT coalesce(string_agg(business_id || ':' || n || ':' || s, ',' ORDER BY business_id), '')
     FROM (SELECT business_id, count(*) AS n, sum(amount) AS s
             FROM financial_entries WHERE type = 'REVENUE' GROUP BY business_id) x), true);
SELECT set_config('mig_rc.before_entries', (SELECT count(*) FROM financial_entries)::text, true);
SELECT set_config('mig_rc.before_categories', (SELECT count(*) FROM categories)::text, true);
SELECT set_config('mig_rc.before_recurring', (SELECT count(*) FROM recurring_entries)::text, true);
SELECT set_config('mig_rc.before_bills', (SELECT count(*) FROM bills)::text, true);
SELECT set_config('mig_rc.before_recbills', (SELECT count(*) FROM recurring_bills)::text, true);
SELECT set_config('mig_rc.before_users', (SELECT count(*) FROM users)::text, true);
SELECT set_config('mig_rc.before_users_hash', (SELECT coalesce(md5(string_agg(t::text, '|' ORDER BY t.id)), '') FROM users t), true);
SELECT set_config('mig_rc.before_biz', (SELECT count(*) FROM businesses)::text, true);
SELECT set_config('mig_rc.before_biz_hash', (SELECT coalesce(md5(string_agg(t::text, '|' ORDER BY t.id)), '') FROM businesses t), true);
SELECT set_config('mig_rc.before_insights', (SELECT count(*) FROM insights)::text, true);
SELECT set_config('mig_rc.before_reads', (SELECT count(*) FROM insight_reads)::text, true);

-- ============================================================================================
-- PASSO 3 (feito ANTES da conversao, que e quando ainda se sabe quem tinha custo) - insights
-- que dependem de custo. Sao dois grupos: (a) "Despesas em alta/queda" de empresas que tinham
-- qualquer dado de COST (o total de despesas delas muda ao unir custo e despesa); (b) qualquer
-- insight cujo texto gravado cite "custo". Os insights se regeneram pelas regras novas.
-- A chave de leitura de um insight e "<metrica em minusculas>:<periodo>" (src/lib/insights/reads.ts).
-- ============================================================================================
CREATE TEMP TABLE mig_rc_empresas_com_custo ON COMMIT DROP AS
  SELECT business_id FROM financial_entries WHERE type = 'COST'
  UNION SELECT business_id FROM recurring_entries WHERE type = 'COST'
  UNION SELECT business_id FROM categories WHERE type = 'COST' AND business_id IS NOT NULL;

CREATE TEMP TABLE mig_rc_insights_apagar ON COMMIT DROP AS
  SELECT id, business_id, lower(metric::text) || ':' || period_key AS chave
    FROM insights
   WHERE (metric = 'EXPENSE_GROWTH' AND business_id IN (SELECT business_id FROM mig_rc_empresas_com_custo))
      OR title ILIKE '%custo%' OR description ILIKE '%custo%' OR recommendation ILIKE '%custo%';

SELECT set_config('mig_rc.expected_reads_deleted',
  (SELECT count(*) FROM insight_reads r JOIN mig_rc_insights_apagar d ON r.business_id = d.business_id AND r.insight_key = d.chave)::text, true);
DELETE FROM insight_reads r USING mig_rc_insights_apagar d WHERE r.business_id = d.business_id AND r.insight_key = d.chave;
DELETE FROM insights WHERE id IN (SELECT id FROM mig_rc_insights_apagar);

-- ============================================================================================
-- PASSO 2 - converte os dados: COST -> EXPENSE nas 3 colunas que usam o enum.
-- (updated_at nao e tocado: e uma troca de classificacao, nao uma edicao do usuario.)
-- ============================================================================================
UPDATE categories SET type = 'EXPENSE' WHERE type = 'COST';
UPDATE financial_entries SET type = 'EXPENSE' WHERE type = 'COST';
UPDATE recurring_entries SET type = 'EXPENSE' WHERE type = 'COST';

-- ============================================================================================
-- PASSO 4 - recria o enum sem COST (padrao do Postgres; gerado por `prisma migrate diff` e
-- revisado). As 3 colunas nao tem DEFAULT (conferido no inventario), entao nao ha default a
-- recriar; os indices (business_id,type) e o unico (business_id,type,normalized_name) sao
-- reconstruidos pelo proprio ALTER COLUMN ... TYPE.
-- ============================================================================================
CREATE TYPE "financial_entry_type_new" AS ENUM ('REVENUE', 'EXPENSE');
ALTER TABLE "categories" ALTER COLUMN "type" TYPE "financial_entry_type_new" USING ("type"::text::"financial_entry_type_new");
ALTER TABLE "financial_entries" ALTER COLUMN "type" TYPE "financial_entry_type_new" USING ("type"::text::"financial_entry_type_new");
ALTER TABLE "recurring_entries" ALTER COLUMN "type" TYPE "financial_entry_type_new" USING ("type"::text::"financial_entry_type_new");
ALTER TYPE "financial_entry_type" RENAME TO "financial_entry_type_old";
ALTER TYPE "financial_entry_type_new" RENAME TO "financial_entry_type";
DROP TYPE "public"."financial_entry_type_old";

-- ============================================================================================
-- PASSO 5 - verificacao: qualquer divergencia aborta a transacao inteira (nada e gravado).
-- ============================================================================================
DO $$
DECLARE
  rotulos text;
  colunas_erradas integer;
  apagados integer;
BEGIN
  -- enum novo: exatamente REVENUE, EXPENSE (nessa ordem); tipo antigo e temporario nao existem
  SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) INTO rotulos
    FROM pg_enum e WHERE e.enumtypid = 'public.financial_entry_type'::regtype;
  IF rotulos IS DISTINCT FROM 'REVENUE,EXPENSE' THEN
    RAISE EXCEPTION 'Verificacao: enum com valores inesperados: %', rotulos;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname IN ('financial_entry_type_old', 'financial_entry_type_new')) THEN
    RAISE EXCEPTION 'Verificacao: o tipo antigo (ou o temporario) ainda existe';
  END IF;
  -- as 3 colunas usam o enum novo (nenhum valor fora do enum: o proprio tipo impede, e conferimos o tipo)
  SELECT count(*) INTO colunas_erradas
    FROM information_schema.columns
   WHERE table_schema = 'public' AND column_name = 'type'
     AND table_name IN ('categories', 'financial_entries', 'recurring_entries')
     AND udt_name <> 'financial_entry_type';
  IF colunas_erradas > 0 THEN
    RAISE EXCEPTION 'Verificacao: % coluna(s) nao usam o enum novo', colunas_erradas;
  END IF;
  IF (SELECT count(*) FROM pg_depend d WHERE d.refobjid = 'public.financial_entry_type'::regtype AND d.classid = 'pg_class'::regclass) <> 3 THEN
    RAISE EXCEPTION 'Verificacao: esperadas exatamente 3 colunas dependentes do enum';
  END IF;

  -- contagem e soma por empresa: EXPENSE depois = COST + EXPENSE antes; REVENUE igual
  IF (SELECT coalesce(string_agg(business_id || ':' || n || ':' || s, ',' ORDER BY business_id), '')
        FROM (SELECT business_id, count(*) AS n, sum(amount) AS s
                FROM financial_entries WHERE type = 'EXPENSE' GROUP BY business_id) x)
     IS DISTINCT FROM current_setting('mig_rc.before_costexp') THEN
    RAISE EXCEPTION 'Verificacao: contagem/soma de despesas por empresa difere de (custos + despesas) antes';
  END IF;
  IF (SELECT coalesce(string_agg(business_id || ':' || n || ':' || s, ',' ORDER BY business_id), '')
        FROM (SELECT business_id, count(*) AS n, sum(amount) AS s
                FROM financial_entries WHERE type = 'REVENUE' GROUP BY business_id) x)
     IS DISTINCT FROM current_setting('mig_rc.before_revenue') THEN
    RAISE EXCEPTION 'Verificacao: contagem/soma de receitas por empresa mudou';
  END IF;

  -- contagens totais
  IF (SELECT count(*) FROM financial_entries)::text <> current_setting('mig_rc.before_entries') THEN
    RAISE EXCEPTION 'Verificacao: mudou o total de lancamentos'; END IF;
  IF (SELECT count(*) FROM categories)::text <> current_setting('mig_rc.before_categories') THEN
    RAISE EXCEPTION 'Verificacao: mudou o total de categorias'; END IF;
  IF (SELECT count(*) FROM recurring_entries)::text <> current_setting('mig_rc.before_recurring') THEN
    RAISE EXCEPTION 'Verificacao: mudou o total de recorrentes'; END IF;
  IF (SELECT count(*) FROM bills)::text <> current_setting('mig_rc.before_bills') THEN
    RAISE EXCEPTION 'Verificacao: mudou o total de contas'; END IF;
  IF (SELECT count(*) FROM recurring_bills)::text <> current_setting('mig_rc.before_recbills') THEN
    RAISE EXCEPTION 'Verificacao: mudou o total de contas recorrentes'; END IF;

  -- users e businesses: contagem e hash (md5 do texto de todas as linhas)
  IF (SELECT count(*) FROM users)::text <> current_setting('mig_rc.before_users')
     OR (SELECT coalesce(md5(string_agg(t::text, '|' ORDER BY t.id)), '') FROM users t) <> current_setting('mig_rc.before_users_hash') THEN
    RAISE EXCEPTION 'Verificacao: users mudou (contagem ou hash)'; END IF;
  IF (SELECT count(*) FROM businesses)::text <> current_setting('mig_rc.before_biz')
     OR (SELECT coalesce(md5(string_agg(t::text, '|' ORDER BY t.id)), '') FROM businesses t) <> current_setting('mig_rc.before_biz_hash') THEN
    RAISE EXCEPTION 'Verificacao: businesses mudou (contagem ou hash)'; END IF;

  -- insights: so sairam os marcados no passo 3
  SELECT count(*) INTO apagados FROM mig_rc_insights_apagar;
  IF (SELECT count(*) FROM insights)::integer <> current_setting('mig_rc.before_insights')::integer - apagados THEN
    RAISE EXCEPTION 'Verificacao: a quantidade de insights nao bate com o esperado'; END IF;
  IF (SELECT count(*) FROM insight_reads)::integer <> current_setting('mig_rc.before_reads')::integer - current_setting('mig_rc.expected_reads_deleted')::integer THEN
    RAISE EXCEPTION 'Verificacao: a quantidade de leituras de insights nao bate com o esperado'; END IF;
END $$;
COMMIT;
