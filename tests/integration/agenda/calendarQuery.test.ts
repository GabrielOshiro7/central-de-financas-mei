import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createAppointment } from "@/lib/agenda/mutations";
import { listAppointmentsForMonth } from "@/lib/agenda/queries";

// Consulta do mes do redesign do Calendario (Etapa Agenda-calendario) -
// mesmo estilo de setup/teardown de isolation.test.ts: businessId/userId
// proprios por arquivo (sufixo Date.now()), teardown explicito, nenhuma
// asercao de contagem global.
describe("agenda - consulta do mes (listAppointmentsForMonth)", () => {
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
      data: { name: "Teste Calendario A", email: `agenda-cal-a-${Date.now()}@example.com`, passwordHash: await hashPassword("SenhaValida123") },
    });
    userAId = userA.id;
    const businessA = await prisma.business.create({ data: { userId: userAId, name: "Empresa Calendario A", currency: "BRL" } });
    businessAId = businessA.id;
    const clientA = await prisma.client.create({ data: { businessId: businessAId, name: "Cliente Calendario A", clientType: "PESSOA_FISICA" } });
    clientAId = clientA.id;
    const serviceA = await prisma.product.create({
      data: { businessId: businessAId, name: "Corte Cal A", type: "SERVICO", durationMinutes: 30, defaultPrice: new Prisma.Decimal(50) },
    });
    serviceAId = serviceA.id;

    const userB = await prisma.user.create({
      data: { name: "Teste Calendario B", email: `agenda-cal-b-${Date.now()}@example.com`, passwordHash: await hashPassword("SenhaValida123") },
    });
    userBId = userB.id;
    const businessB = await prisma.business.create({ data: { userId: userBId, name: "Empresa Calendario B", currency: "BRL" } });
    businessBId = businessB.id;
    const clientB = await prisma.client.create({ data: { businessId: businessBId, name: "Cliente Calendario B", clientType: "PESSOA_FISICA" } });
    clientBId = clientB.id;
    const serviceB = await prisma.product.create({
      data: { businessId: businessBId, name: "Corte Cal B", type: "SERVICO", durationMinutes: 30, defaultPrice: new Prisma.Decimal(50) },
    });
    serviceBId = serviceB.id;
  });

  afterAll(async () => {
    await prisma.appointmentService.deleteMany({ where: { appointment: { businessId: { in: [businessAId, businessBId] } } } });
    await prisma.appointment.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
    await prisma.product.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
    await prisma.client.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
    await prisma.business.deleteMany({ where: { id: { in: [businessAId, businessBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  });

  it("nao retorna agendamentos de outro businessId", async () => {
    // 10h de 10/ago/2026 em Toquio = 01:00Z do mesmo dia.
    const startAt = new Date("2026-08-10T01:00:00Z");
    const resultA = await createAppointment(businessAId, { clientId: clientAId, startAt, services: [{ productId: serviceAId }] });
    const resultB = await createAppointment(businessBId, { clientId: clientBId, startAt, services: [{ productId: serviceBId }] });
    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);

    const monthForA = await listAppointmentsForMonth(businessAId, 2026, 8);
    expect(monthForA.map((a) => a.businessId)).toEqual([businessAId]);
    if (resultB.ok) {
      expect(monthForA.find((a) => a.id === resultB.value.id)).toBeUndefined();
    }
  });

  it("inclui 23:59 do ultimo dia do mes (Toquio) e exclui 00:00 do dia 1 do mes seguinte (Toquio)", async () => {
    // 23:59 de 31/ago/2026 em Toquio = 14:59Z de 31/ago (UTC+9).
    const lastMinuteOfAugust = new Date("2026-08-31T14:59:00Z");
    // 00:00 de 1/set/2026 em Toquio = 15:00Z de 31/ago - limite exclusivo.
    const firstInstantOfSeptember = new Date("2026-08-31T15:00:00Z");

    // allowOverlap:true porque os dois horarios ficam a so 1 minuto de
    // distancia (servico de 30min) - o teste e sobre o limite do range do
    // mes, nao sobre deteccao de sobreposicao (ja coberta em
    // tests/integration/agenda/mutations.test.ts).
    const inAugust = await createAppointment(businessAId, {
      clientId: clientAId,
      startAt: lastMinuteOfAugust,
      services: [{ productId: serviceAId }],
      allowOverlap: true,
    });
    const inSeptember = await createAppointment(businessAId, {
      clientId: clientAId,
      startAt: firstInstantOfSeptember,
      services: [{ productId: serviceAId }],
      allowOverlap: true,
    });
    expect(inAugust.ok).toBe(true);
    expect(inSeptember.ok).toBe(true);

    const august = await listAppointmentsForMonth(businessAId, 2026, 8);
    const augustIds = august.map((a) => a.id);

    if (inAugust.ok) expect(augustIds).toContain(inAugust.value.id);
    if (inSeptember.ok) expect(augustIds).not.toContain(inSeptember.value.id);
  });
});
