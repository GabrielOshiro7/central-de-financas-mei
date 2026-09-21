-- CreateEnum
CREATE TYPE "product_type" AS ENUM ('PRODUTO', 'SERVICO');

-- CreateEnum
CREATE TYPE "appointment_status" AS ENUM ('AGENDADO', 'CONFIRMADO', 'CONCLUIDO', 'CANCELADO', 'FALTOU');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "duration_minutes" INTEGER,
ADD COLUMN     "type" "product_type" NOT NULL DEFAULT 'PRODUTO';

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "status" "appointment_status" NOT NULL DEFAULT 'AGENDADO',
    "notes" TEXT,
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "sale_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_services" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "product_id" TEXT,
    "name_snapshot" TEXT NOT NULL,
    "duration_minutes_snapshot" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "appointment_services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "appointments_sale_id_key" ON "appointments"("sale_id");

-- CreateIndex
CREATE INDEX "appointments_business_id_start_at_idx" ON "appointments"("business_id", "start_at");

-- CreateIndex
CREATE INDEX "appointments_business_id_client_id_start_at_idx" ON "appointments"("business_id", "client_id", "start_at");

-- CreateIndex
CREATE INDEX "appointments_business_id_status_start_at_idx" ON "appointments"("business_id", "status", "start_at");

-- CreateIndex
CREATE INDEX "appointment_services_product_id_idx" ON "appointment_services"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_services_appointment_id_position_key" ON "appointment_services"("appointment_id", "position");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint (acrescentado a mao - Prisma 7.10 nao suporta @@check
-- nativo; testado via `prisma validate` num schema isolado, ver plano da
-- Etapa 8 ponto 4. Aditivo: tabela nova, sem linhas existentes para violar.)
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_end_after_start" CHECK ("end_at" > "start_at");

-- AddForeignKey
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
