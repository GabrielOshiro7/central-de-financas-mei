import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createAppointment, updateAppointment } from "@/lib/agenda/mutations";
import { getAppointmentById } from "@/lib/agenda/queries";

// Isolamento cross-empresa (Etapa 8, incremento 3). Teardown na ordem:
// appointmentService -> appointment -> bill/financialEntry -> sale ->
// client -> business -> user. businessId/userId proprios por arquivo
// (sufixo Date.now()), nenhum deleteMany sem where, nenhuma asercao de
// contagem global.
describe("agenda - isolamento entre empresas", () => {
  let userAId: string;
  let businessAId: string;
  let clientAId: string;
  let serviceAId: string;

  let userBId: string;
  let businessBId: string;
  let clientBId: string;
  let serviceBId: string;

  beforeAll(async () => {
    const userA = await prisma.user.create({
      data: { name: "Teste Agenda A", email: `agenda-a-${Date.now()}@example.com`, passwordHash: await hashPassword("SenhaValida123") },
    });
    userAId = userA.id;
    const businessA = await prisma.business.create({ data: { userId: userAId, name: "Empresa Agenda A", currency: "BRL" } });
    businessAId = businessA.id;
    const clientA = await prisma.client.create({ data: { businessId: businessAId, name: "Cliente A", clientType: "PESSOA_FISICA" } });
    clientAId = clientA.id;
    const serviceA = await prisma.product.create({
      data: { businessId: businessAId, name: "Corte A", type: "SERVICO", durationMinutes: 30, defaultPrice: new Prisma.Decimal(50) },
    });
    serviceAId = serviceA.id;

    const userB = await prisma.user.create({
      data: { name: "Teste Agenda B", email: `agenda-b-${Date.now()}@example.com`, passwordHash: await hashPassword("SenhaValida123") },
    });
    userBId = userB.id;
    const businessB = await prisma.business.create({ data: { userId: userBId, name: "Empresa Agenda B", currency: "BRL" } });
    businessBId = businessB.id;
    const clientB = await prisma.client.create({ data: { businessId: businessBId, name: "Cliente B", clientType: "PESSOA_FISICA" } });
    clientBId = clientB.id;
    const serviceB = await prisma.product.create({
      data: { businessId: businessBId, name: "Corte B", type: "SERVICO", durationMinutes: 30, defaultPrice: new Prisma.Decimal(50) },
    });
    serviceBId = serviceB.id;
  });

  afterAll(async () => {
    await prisma.appointmentService.deleteMany({ where: { appointment: { businessId: { in: [businessAId, businessBId] } } } });
    await prisma.appointment.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
    await prisma.bill.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
    await prisma.financialEntry.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
    await prisma.sale.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
    await prisma.product.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
    await prisma.client.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
    await prisma.business.deleteMany({ where: { id: { in: [businessAId, businessBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  });

  it("criar agendamento com clientId de outra empresa é rejeitado", async () => {
    const result = await createAppointment(businessAId, {
      clientId: clientBId, // cliente da empresa B
      startAt: new Date("2026-03-10T10:00:00Z"),
      services: [{ productId: serviceAId }],
    });
    expect(result.ok).toBe(false);
  });

  it("criar agendamento com serviço (productId) de outra empresa é rejeitado", async () => {
    const result = await createAppointment(businessAId, {
      clientId: clientAId,
      startAt: new Date("2026-03-10T10:00:00Z"),
      services: [{ productId: serviceBId }], // servico da empresa B
    });
    expect(result.ok).toBe(false);
  });

  it("getAppointmentById nunca retorna um agendamento de outra empresa", async () => {
    const created = await createAppointment(businessAId, {
      clientId: clientAId,
      startAt: new Date("2026-03-11T10:00:00Z"),
      services: [{ productId: serviceAId }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const foundByOwner = await getAppointmentById(businessAId, created.value.id);
    expect(foundByOwner).not.toBeNull();

    const foundByOther = await getAppointmentById(businessBId, created.value.id);
    expect(foundByOther).toBeNull();
  });

  it("updateAppointment com id de outra empresa é rejeitado (nao vaza nem edita)", async () => {
    const created = await createAppointment(businessAId, {
      clientId: clientAId,
      startAt: new Date("2026-03-12T10:00:00Z"),
      services: [{ productId: serviceAId }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await updateAppointment(businessBId, created.value.id, {
      clientId: clientBId,
      startAt: new Date("2026-03-13T10:00:00Z"),
      services: [{ productId: serviceBId }],
    });
    expect(result.ok).toBe(false);

    // Confirma que nada mudou na venda real da empresa A.
    const unchanged = await getAppointmentById(businessAId, created.value.id);
    expect(unchanged?.startAt.toISOString()).toBe("2026-03-12T10:00:00.000Z");
  });

  it("excluir fisicamente um cliente com agendamento vinculado é rejeitado pelo banco (P2003, RESTRICT)", async () => {
    const created = await createAppointment(businessAId, {
      clientId: clientAId,
      startAt: new Date("2026-03-14T10:00:00Z"),
      services: [{ productId: serviceAId }],
    });
    expect(created.ok).toBe(true);

    // Nao existe rota de DELETE de cliente na aplicacao hoje - chamada
    // direta ao Prisma, contornando a app, pra provar que a constraint do
    // banco protege mesmo sem nenhum codigo de aplicacao no caminho.
    await expect(prisma.client.delete({ where: { id: clientAId } })).rejects.toMatchObject({ code: "P2003" });
  });
});
