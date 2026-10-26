import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createAppointment, changeAppointmentStatus, completeAppointment } from "@/lib/agenda/mutations";
import { getAppointmentById } from "@/lib/agenda/queries";
import { cancelSale } from "@/lib/sales/mutations";

// Fuso da empresa de teste: Asia/Tokyo (default da F2). Antes da F3c a Agenda
// usava o fuso fixo AGENDA_TIMEZONE = "Asia/Tokyo" - mesmo valor.
const BUSINESS_TZ = "Asia/Tokyo";

describe("agenda - transições de status", () => {
  let userId: string;
  let businessId: string;
  let clientId: string;
  let serviceId: string;
  let revenueCategoryId: string;

  beforeAll(async () => {
    const revenueCategory = await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } });
    revenueCategoryId = revenueCategory.id;

    const user = await prisma.user.create({
      data: { name: "Teste Agenda Transitions", email: `agenda-trans-${Date.now()}@example.com`, passwordHash: await hashPassword("SenhaValida123") },
    });
    userId = user.id;
    const business = await prisma.business.create({ data: { userId, name: "Empresa Agenda Transitions", currency: "BRL" } });
    businessId = business.id;
    const client = await prisma.client.create({ data: { businessId, name: "Cliente Transitions", clientType: "PESSOA_FISICA" } });
    clientId = client.id;
    const service = await prisma.product.create({
      data: { businessId, name: "Corte", type: "SERVICO", durationMinutes: 30, defaultPrice: new Prisma.Decimal(50) },
    });
    serviceId = service.id;
  });

  afterAll(async () => {
    await prisma.appointmentService.deleteMany({ where: { appointment: { businessId } } });
    await prisma.appointment.deleteMany({ where: { businessId } });
    await prisma.bill.deleteMany({ where: { businessId } });
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.sale.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.client.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  async function createOne(startAt: string) {
    const created = await createAppointment(businessId, { clientId, startAt: new Date(startAt), services: [{ productId: serviceId }] });
    if (!created.ok) throw new Error("setup falhou: " + created.error);
    return created.value.id;
  }

  it("confirmar (AGENDADO -> CONFIRMADO) funciona", async () => {
    const id = await createOne("2026-05-01T10:00:00Z");
    const result = await changeAppointmentStatus(businessId, id, "CONFIRMADO");
    expect(result.ok).toBe(true);
    const appointment = await getAppointmentById(businessId, id);
    expect(appointment?.status).toBe("CONFIRMADO");
  });

  it("cancelar concluído é rejeitado", async () => {
    const id = await createOne("2026-05-02T10:00:00Z");
    const completed = await completeAppointment(businessId, userId, id, {
      categoryId: revenueCategoryId,
      items: [{ description: "Corte", quantity: 1, unitPrice: 50 }],
      installments: [{ dueDate: "2026-05-02", amount: 50, paidNow: true }],
    }, BUSINESS_TZ);
    expect(completed.ok).toBe(true);

    const result = await changeAppointmentStatus(businessId, id, "CANCELADO");
    expect(result.ok).toBe(false);
  });

  it("faltou no futuro é rejeitado; faltou no passado é aceito", async () => {
    const futureId = await createOne("2099-01-01T10:00:00Z");
    const futureResult = await changeAppointmentStatus(businessId, futureId, "FALTOU", { now: new Date("2026-05-03T00:00:00Z") });
    expect(futureResult.ok).toBe(false);

    const pastId = await createOne("2026-05-04T10:00:00Z");
    const pastResult = await changeAppointmentStatus(businessId, pastId, "FALTOU", { now: new Date("2026-05-05T00:00:00Z") });
    expect(pastResult.ok).toBe(true);
  });

  it("cancelar é idempotente (cancelar 2x não dá erro)", async () => {
    const id = await createOne("2026-05-06T10:00:00Z");
    const first = await changeAppointmentStatus(businessId, id, "CANCELADO");
    expect(first.ok).toBe(true);
    const second = await changeAppointmentStatus(businessId, id, "CANCELADO");
    expect(second.ok).toBe(true);
  });

  it("reabrir CANCELADO -> AGENDADO funciona e limpa cancelledAt", async () => {
    const id = await createOne("2026-05-07T10:00:00Z");
    await changeAppointmentStatus(businessId, id, "CANCELADO");

    const cancelled = await getAppointmentById(businessId, id);
    expect(cancelled?.cancelledAt).not.toBeNull();

    const reopened = await changeAppointmentStatus(businessId, id, "AGENDADO");
    expect(reopened.ok).toBe(true);

    const appointment = await getAppointmentById(businessId, id);
    expect(appointment?.status).toBe("AGENDADO");
    expect(appointment?.cancelledAt).toBeNull();
  });

  it("reabrir FALTOU -> AGENDADO funciona", async () => {
    const id = await createOne("2026-05-08T10:00:00Z");
    await changeAppointmentStatus(businessId, id, "FALTOU", { now: new Date("2026-05-09T00:00:00Z") });
    const reopened = await changeAppointmentStatus(businessId, id, "AGENDADO");
    expect(reopened.ok).toBe(true);
  });

  it("NUNCA reabre a partir de CONCLUIDO", async () => {
    const id = await createOne("2026-05-10T10:00:00Z");
    const completed = await completeAppointment(businessId, userId, id, {
      categoryId: revenueCategoryId,
      items: [{ description: "Corte", quantity: 1, unitPrice: 50 }],
      installments: [{ dueDate: "2026-05-10", amount: 50, paidNow: true }],
    }, BUSINESS_TZ);
    expect(completed.ok).toBe(true);

    const result = await changeAppointmentStatus(businessId, id, "AGENDADO");
    expect(result.ok).toBe(false);
  });

  it("reabrir reaplica a checagem de sobreposição (aviso + allowOverlap)", async () => {
    const id = await createOne("2026-05-11T10:00:00Z"); // 10:00-10:30
    await changeAppointmentStatus(businessId, id, "CANCELADO");

    // Outro agendamento passa a ocupar o mesmo horário enquanto o primeiro
    // estava cancelado.
    const other = await createAppointment(businessId, {
      clientId,
      startAt: new Date("2026-05-11T10:00:00Z"),
      services: [{ productId: serviceId }],
    });
    expect(other.ok).toBe(true);

    const reopenBlocked = await changeAppointmentStatus(businessId, id, "AGENDADO");
    expect(reopenBlocked.ok).toBe(false);
    if (!reopenBlocked.ok) expect(reopenBlocked.conflicts?.length).toBe(1);

    const reopenForced = await changeAppointmentStatus(businessId, id, "AGENDADO", { allowOverlap: true });
    expect(reopenForced.ok).toBe(true);
  });

  it("CONCLUIDO permanece terminal mesmo depois de a Sale vinculada ser cancelada", async () => {
    const id = await createOne("2026-05-12T10:00:00Z");
    const completed = await completeAppointment(businessId, userId, id, {
      categoryId: revenueCategoryId,
      items: [{ description: "Corte", quantity: 1, unitPrice: 50 }],
      installments: [{ dueDate: "2026-05-12", amount: 50, paidNow: false }], // a prazo - Bill PENDING, cancelável
    }, BUSINESS_TZ);
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;

    const cancelResult = await cancelSale(businessId, completed.value.saleId);
    expect(cancelResult.ok).toBe(true);

    // O agendamento continua CONCLUIDO - nenhuma transição o tira dali por
    // causa do cancelamento da venda.
    for (const to of ["AGENDADO", "CONFIRMADO", "CANCELADO", "FALTOU"] as const) {
      const attempt = await changeAppointmentStatus(businessId, id, to);
      expect(attempt.ok).toBe(false);
    }
    const appointment = await getAppointmentById(businessId, id);
    expect(appointment?.status).toBe("CONCLUIDO");
  });
});
