BEGIN;

-- Agenda A1 (aditiva): base do fluxo novo da Agenda (kind DAY - so o dia, com
-- servicos, valores, categoria e pagamento definidos na criacao). Nada e
-- removido nem muda de tipo; os agendamentos existentes viram kind TIMED e
-- nao mudam de comportamento. So: CREATE TYPE/TABLE/INDEX/CONSTRAINT,
-- ADD COLUMN, DROP NOT NULL (start_at, end_at, duration_minutes_snapshot -
-- o fluxo DAY nao tem horario nem duracao; TIMED continua obrigado a ter
-- horario pela CHECK appointments_timed_fields_check).
--
-- Rollback (manual; so enquanto NAO houver nenhuma linha kind DAY - com elas
-- o SET NOT NULL de start_at/end_at falharia):
--   BEGIN;
--   ALTER TABLE "appointments" DROP CONSTRAINT "appointments_timed_fields_check", DROP CONSTRAINT "appointments_day_fields_check", DROP CONSTRAINT "appointments_auto_complete_day_only_check";
--   ALTER TABLE "appointments" DROP CONSTRAINT "appointments_category_id_fkey";
--   ALTER TABLE "sales" DROP CONSTRAINT "sales_appointment_id_fkey";
--   DROP TABLE "appointment_installments";
--   DROP INDEX "appointments_business_id_scheduled_on_idx", "appointments_business_id_kind_status_scheduled_on_idx", "sales_appointment_id_idx";
--   ALTER TABLE "sales" DROP COLUMN "appointment_id";
--   ALTER TABLE "appointment_services" DROP COLUMN "quantity", DROP COLUMN "unit_price", ALTER COLUMN "duration_minutes_snapshot" SET NOT NULL;
--   ALTER TABLE "appointments" DROP COLUMN "auto_complete_eligible", DROP COLUMN "category_id", DROP COLUMN "completion_seq", DROP COLUMN "kind", DROP COLUMN "payment_method", DROP COLUMN "payment_timing", DROP COLUMN "scheduled_on", ALTER COLUMN "start_at" SET NOT NULL, ALTER COLUMN "end_at" SET NOT NULL;
--   DROP TYPE "payment_timing";
--   DROP TYPE "appointment_kind";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261103100000_agenda_day_flow';
--   COMMIT;

-- 0. Contagens e hash das colunas que JA existem, antes de qualquer mudanca
-- (parametros LOCAIS da transacao - so leitura).
SELECT set_config('a1.appts', (SELECT count(*) FROM "appointments")::text, true),
       set_config('a1.svcs', (SELECT count(*) FROM "appointment_services")::text, true),
       set_config('a1.sales', (SELECT count(*) FROM "sales")::text, true),
       set_config('a1.h_appts', (SELECT coalesce(md5(string_agg(row(t.id, t.business_id, t.client_id, t.start_at, t.end_at, t.status, t.notes, t.completed_at, t.cancelled_at, t.sale_id, t.created_at, t.updated_at)::text, '|' ORDER BY t.id)), '') FROM "appointments" t), true),
       set_config('a1.h_svcs', (SELECT coalesce(md5(string_agg(row(t.id, t.appointment_id, t.product_id, t.name_snapshot, t.duration_minutes_snapshot, t."position")::text, '|' ORDER BY t.id)), '') FROM "appointment_services" t), true),
       set_config('a1.h_sales', (SELECT coalesce(md5(string_agg(row(t.id, t.business_id, t.client_id, t.category_id, t.user_id, t.sale_number, t.status, t.subtotal, t.discount_type, t.discount_value, t.discount_amount, t.total, t.payment_method, t.notes, t.client_request_id, t.created_at, t.updated_at, t.sale_on)::text, '|' ORDER BY t.id)), '') FROM "sales" t), true);

-- 1. Tipos.
CREATE TYPE "appointment_kind" AS ENUM ('TIMED', 'DAY');
CREATE TYPE "payment_timing" AS ENUM ('AVISTA', 'APRAZO');

-- 2. Colunas novas (as NOT NULL com default ja preenchem as linhas antigas)
-- e as tres DROP NOT NULL.
ALTER TABLE "appointment_services" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "unit_price" DECIMAL(14,2),
ALTER COLUMN "duration_minutes_snapshot" DROP NOT NULL;

ALTER TABLE "appointments" ADD COLUMN "auto_complete_eligible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "category_id" TEXT,
ADD COLUMN "completion_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "kind" "appointment_kind" NOT NULL DEFAULT 'TIMED',
ADD COLUMN "payment_method" TEXT,
ADD COLUMN "payment_timing" "payment_timing",
ADD COLUMN "scheduled_on" DATE,
ALTER COLUMN "start_at" DROP NOT NULL,
ALTER COLUMN "end_at" DROP NOT NULL;

ALTER TABLE "sales" ADD COLUMN "appointment_id" TEXT;

-- 3. Backfill dos antigos (explicito, embora os defaults ja o tenham feito):
-- todo agendamento existente e TIMED e nunca e elegivel a conclusao
-- automatica. Deve atualizar 0 linhas.
UPDATE "appointments" SET "kind" = 'TIMED', "auto_complete_eligible" = false
WHERE "kind" IS DISTINCT FROM 'TIMED' OR "auto_complete_eligible" IS DISTINCT FROM false;

-- 4. Tabela de parcelas planejadas (fluxo DAY a prazo).
CREATE TABLE "appointment_installments" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "due_on" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_installments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "appointment_installments_amount_check" CHECK ("amount" > 0)
);

-- 5. Indices.
CREATE UNIQUE INDEX "appointment_installments_appointment_id_position_key" ON "appointment_installments"("appointment_id", "position");
CREATE INDEX "appointments_business_id_scheduled_on_idx" ON "appointments"("business_id", "scheduled_on");
CREATE INDEX "appointments_business_id_kind_status_scheduled_on_idx" ON "appointments"("business_id", "kind", "status", "scheduled_on");
CREATE INDEX "sales_appointment_id_idx" ON "sales"("appointment_id");

-- 6. Chaves estrangeiras.
ALTER TABLE "sales" ADD CONSTRAINT "sales_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointment_installments" ADD CONSTRAINT "appointment_installments_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Invariantes por fluxo (CHECK; o Prisma nao as modela). TIMED continua
-- obrigado a ter horario (compensa o DROP NOT NULL); DAY exige dia,
-- categoria e condicao de pagamento; so DAY pode ser elegivel a conclusao
-- automatica.
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_timed_fields_check"
  CHECK ("kind" <> 'TIMED' OR ("start_at" IS NOT NULL AND "end_at" IS NOT NULL));
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_day_fields_check"
  CHECK ("kind" <> 'DAY' OR ("scheduled_on" IS NOT NULL AND "category_id" IS NOT NULL AND "payment_timing" IS NOT NULL));
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_auto_complete_day_only_check"
  CHECK ("kind" = 'DAY' OR "auto_complete_eligible" = false);

-- 8. Verificacao SOMENTE LEITURA: aborta (e desfaz tudo) se alguma contagem
-- mudou, se algum valor das colunas antigas mudou (hash) ou se o backfill
-- das colunas novas nao e o esperado para as linhas antigas.
DO $$
DECLARE
  n integer;
BEGIN
  IF (SELECT count(*) FROM "appointments") <> current_setting('a1.appts')::bigint
     OR (SELECT count(*) FROM "appointment_services") <> current_setting('a1.svcs')::bigint
     OR (SELECT count(*) FROM "sales") <> current_setting('a1.sales')::bigint THEN
    RAISE EXCEPTION 'A1: contagens mudaram durante a migracao';
  END IF;
  IF (SELECT coalesce(md5(string_agg(row(t.id, t.business_id, t.client_id, t.start_at, t.end_at, t.status, t.notes, t.completed_at, t.cancelled_at, t.sale_id, t.created_at, t.updated_at)::text, '|' ORDER BY t.id)), '') FROM "appointments" t) <> current_setting('a1.h_appts')
     OR (SELECT coalesce(md5(string_agg(row(t.id, t.appointment_id, t.product_id, t.name_snapshot, t.duration_minutes_snapshot, t."position")::text, '|' ORDER BY t.id)), '') FROM "appointment_services" t) <> current_setting('a1.h_svcs')
     OR (SELECT coalesce(md5(string_agg(row(t.id, t.business_id, t.client_id, t.category_id, t.user_id, t.sale_number, t.status, t.subtotal, t.discount_type, t.discount_value, t.discount_amount, t.total, t.payment_method, t.notes, t.client_request_id, t.created_at, t.updated_at, t.sale_on)::text, '|' ORDER BY t.id)), '') FROM "sales" t) <> current_setting('a1.h_sales') THEN
    RAISE EXCEPTION 'A1: alguma coluna existente mudou de valor (hash diferente)';
  END IF;
  SELECT count(*) INTO n FROM "appointments"
  WHERE "kind" <> 'TIMED' OR "auto_complete_eligible" OR "completion_seq" <> 0
     OR "scheduled_on" IS NOT NULL OR "category_id" IS NOT NULL OR "payment_timing" IS NOT NULL OR "payment_method" IS NOT NULL;
  IF n > 0 THEN RAISE EXCEPTION 'A1: % appointments antigos com backfill inesperado', n; END IF;
  SELECT count(*) INTO n FROM "appointment_services" WHERE "quantity" <> 1 OR "unit_price" IS NOT NULL;
  IF n > 0 THEN RAISE EXCEPTION 'A1: % appointment_services antigos com backfill inesperado', n; END IF;
  SELECT count(*) INTO n FROM "sales" WHERE "appointment_id" IS NOT NULL;
  IF n > 0 THEN RAISE EXCEPTION 'A1: % sales antigas com appointment_id preenchido', n; END IF;
END $$;

COMMIT;
