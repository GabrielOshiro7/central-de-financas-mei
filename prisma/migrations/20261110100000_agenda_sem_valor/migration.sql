BEGIN;

-- Agenda: agendamento DAY SEM VALOR (ex.: reuniao). Total zero => categoria de
-- receita e pagamento nao sao exigidos (nulos), nao ha parcelas planejadas e o
-- cliente e opcional; todo DAY precisa de ao menos um entre cliente, servico e
-- titulo. Nada e removido nem muda de tipo; so: ADD COLUMN, DROP NOT NULL,
-- troca de CHECK (DROP + ADD na mesma transacao) e duas CHECKs novas.
--
-- Sobre a regra "valor > 0 exige categoria e pagamento" e a regra "ao menos um
-- entre cliente/servico/titulo": ficam no SERVIDOR (Zod, dayAppointmentInputSchema),
-- porque o total depende das linhas de servico (appointment_services), que uma
-- CHECK de linha nao enxerga. No banco ficam so as invariantes de linha:
--  - appointments_day_fields_check: DAY tem sempre o dia (a exigencia de
--    categoria e pagamento saiu daqui);
--  - appointments_payment_coherence_check: categoria e condicao de pagamento
--    ou ambas nulas ou ambas preenchidas;
--  - appointments_timed_client_check: TIMED continua sempre com cliente
--    (compensa o DROP NOT NULL, como a timed_fields_check fez com o horario).
--
-- Rollback (manual; so enquanto NAO houver nenhuma linha com client_id nulo nem
-- DAY sem categoria/pagamento - com elas o SET NOT NULL / a CHECK antiga
-- falhariam):
--   BEGIN;
--   ALTER TABLE "appointments" DROP CONSTRAINT "appointments_timed_client_check", DROP CONSTRAINT "appointments_payment_coherence_check", DROP CONSTRAINT "appointments_day_fields_check";
--   ALTER TABLE "appointments" ADD CONSTRAINT "appointments_day_fields_check"
--     CHECK ("kind" <> 'DAY' OR ("scheduled_on" IS NOT NULL AND "category_id" IS NOT NULL AND "payment_timing" IS NOT NULL));
--   ALTER TABLE "appointments" DROP COLUMN "title", ALTER COLUMN "client_id" SET NOT NULL;
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261110100000_agenda_sem_valor';
--   COMMIT;

-- 0. Contagens e hash de TODAS as colunas que ja existem, antes de qualquer
-- mudanca (parametros LOCAIS da transacao - so leitura).
SELECT set_config('sv.appts', (SELECT count(*) FROM "appointments")::text, true),
       set_config('sv.svcs', (SELECT count(*) FROM "appointment_services")::text, true),
       set_config('sv.insts', (SELECT count(*) FROM "appointment_installments")::text, true),
       set_config('sv.sales', (SELECT count(*) FROM "sales")::text, true),
       set_config('sv.h_appts', (SELECT coalesce(md5(string_agg(row(t.id, t.business_id, t.client_id, t.start_at, t.end_at, t.status, t.notes, t.kind, t.scheduled_on, t.category_id, t.payment_timing, t.payment_method, t.auto_complete_eligible, t.completion_seq, t.completed_at, t.cancelled_at, t.sale_id, t.created_at, t.updated_at)::text, '|' ORDER BY t.id)), '') FROM "appointments" t), true),
       set_config('sv.h_svcs', (SELECT coalesce(md5(string_agg(row(t.*)::text, '|' ORDER BY t.id)), '') FROM "appointment_services" t), true),
       set_config('sv.h_insts', (SELECT coalesce(md5(string_agg(row(t.*)::text, '|' ORDER BY t.id)), '') FROM "appointment_installments" t), true),
       set_config('sv.h_sales', (SELECT coalesce(md5(string_agg(row(t.*)::text, '|' ORDER BY t.id)), '') FROM "sales" t), true);

-- 1. Coluna nova (nula nas linhas existentes) e client_id anulavel (hoje e
-- NOT NULL).
ALTER TABLE "appointments" ADD COLUMN "title" TEXT,
ALTER COLUMN "client_id" DROP NOT NULL;

-- 2. Substitui a CHECK do DAY: so o dia continua obrigatorio.
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_day_fields_check";
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_day_fields_check"
  CHECK ("kind" <> 'DAY' OR "scheduled_on" IS NOT NULL);

-- 3. Coerencia categoria/pagamento: ambos nulos ou ambos preenchidos.
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_payment_coherence_check"
  CHECK (("category_id" IS NULL) = ("payment_timing" IS NULL));

-- 4. TIMED continua sempre com cliente.
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_timed_client_check"
  CHECK ("kind" <> 'TIMED' OR "client_id" IS NOT NULL);

-- 5. Verificacao SOMENTE LEITURA: aborta (e desfaz tudo) se alguma contagem
-- mudou, se algum valor das colunas existentes mudou (hash), se alguma linha
-- existente viola as CHECKs novas, se o title nao e todo nulo ou se o catalogo
-- nao ficou como esperado.
DO $$
DECLARE
  n integer;
  def text;
BEGIN
  IF (SELECT count(*) FROM "appointments") <> current_setting('sv.appts')::bigint
     OR (SELECT count(*) FROM "appointment_services") <> current_setting('sv.svcs')::bigint
     OR (SELECT count(*) FROM "appointment_installments") <> current_setting('sv.insts')::bigint
     OR (SELECT count(*) FROM "sales") <> current_setting('sv.sales')::bigint THEN
    RAISE EXCEPTION 'sem-valor: contagens mudaram durante a migracao';
  END IF;
  IF (SELECT coalesce(md5(string_agg(row(t.id, t.business_id, t.client_id, t.start_at, t.end_at, t.status, t.notes, t.kind, t.scheduled_on, t.category_id, t.payment_timing, t.payment_method, t.auto_complete_eligible, t.completion_seq, t.completed_at, t.cancelled_at, t.sale_id, t.created_at, t.updated_at)::text, '|' ORDER BY t.id)), '') FROM "appointments" t) <> current_setting('sv.h_appts')
     OR (SELECT coalesce(md5(string_agg(row(t.*)::text, '|' ORDER BY t.id)), '') FROM "appointment_services" t) <> current_setting('sv.h_svcs')
     OR (SELECT coalesce(md5(string_agg(row(t.*)::text, '|' ORDER BY t.id)), '') FROM "appointment_installments" t) <> current_setting('sv.h_insts')
     OR (SELECT coalesce(md5(string_agg(row(t.*)::text, '|' ORDER BY t.id)), '') FROM "sales" t) <> current_setting('sv.h_sales') THEN
    RAISE EXCEPTION 'sem-valor: alguma coluna existente mudou de valor (hash diferente)';
  END IF;

  SELECT count(*) INTO n FROM "appointments" WHERE "title" IS NOT NULL;
  IF n > 0 THEN RAISE EXCEPTION 'sem-valor: % linhas antigas com title preenchido', n; END IF;

  SELECT count(*) INTO n FROM "appointments" WHERE NOT ("kind" <> 'DAY' OR "scheduled_on" IS NOT NULL);
  IF n > 0 THEN RAISE EXCEPTION 'sem-valor: % linhas violam appointments_day_fields_check', n; END IF;
  SELECT count(*) INTO n FROM "appointments" WHERE NOT (("category_id" IS NULL) = ("payment_timing" IS NULL));
  IF n > 0 THEN RAISE EXCEPTION 'sem-valor: % linhas violam appointments_payment_coherence_check', n; END IF;
  SELECT count(*) INTO n FROM "appointments" WHERE NOT ("kind" <> 'TIMED' OR "client_id" IS NOT NULL);
  IF n > 0 THEN RAISE EXCEPTION 'sem-valor: % linhas violam appointments_timed_client_check', n; END IF;

  IF (SELECT is_nullable FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'client_id') <> 'YES' THEN
    RAISE EXCEPTION 'sem-valor: client_id continua NOT NULL';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'title' AND data_type = 'text' AND is_nullable = 'YES') THEN
    RAISE EXCEPTION 'sem-valor: coluna title ausente ou com tipo/nulabilidade inesperados';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = 'appointments'::regclass AND conname = 'appointments_day_fields_check';
  IF def IS NULL OR def LIKE '%category_id%' OR def LIKE '%payment_timing%' THEN
    RAISE EXCEPTION 'sem-valor: appointments_day_fields_check nao foi substituida (%)', def;
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'appointments'::regclass
        AND conname IN ('appointments_day_fields_check', 'appointments_payment_coherence_check', 'appointments_timed_client_check', 'appointments_timed_fields_check', 'appointments_auto_complete_day_only_check')) <> 5 THEN
    RAISE EXCEPTION 'sem-valor: conjunto de CHECKs de appointments inesperado';
  END IF;
END $$;

COMMIT;
