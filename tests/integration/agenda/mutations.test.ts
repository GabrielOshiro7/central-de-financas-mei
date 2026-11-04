import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { updateAppointment } from "@/lib/agenda/mutations";
import { createTimedAppointment } from "../../helpers/timedAppointment";
import { getAppointmentById } from "@/lib/agenda/queries";

describe("agenda - mutations (criar/editar/remarcar)", () => {
  let userId: string;
  let businessId: string;
  let clientId: string;
  let haircutId: string; // 30 min
  let beardId: string; // 20 min

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: "Teste Agenda Mutations", email: `agenda-mut-${Date.now()}@example.com`, passwordHash: await hashPassword("SenhaValida123") },
    });
    userId = user.id;
    const business = await prisma.business.create({ data: { userId, name: "Empresa Agenda Mutations", currency: "BRL" } });
    businessId = business.id;
    const client = await prisma.client.create({ data: { businessId, name: "Cliente Mutations", clientType: "PESSOA_FISICA" } });
    clientId = client.id;

    const haircut = await prisma.product.create({
      data: { businessId, name: "Corte", type: "SERVICO", durationMinutes: 30, defaultPrice: new Prisma.Decimal(50) },
    });
    haircutId = haircut.id;
    const beard = await prisma.product.create({
      data: { businessId, name: "Barba", type: "SERVICO", durationMinutes: 20, defaultPrice: new Prisma.Decimal(30) },
    });
    beardId = beard.id;
  });

  afterAll(async () => {
    await prisma.appointmentService.deleteMany({ where: { appointment: { businessId } } });
    await prisma.appointment.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.client.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  // Agenda A6: os casos de CRIACAO TIMED ("endAt calculado na criacao" e
  // "sobreposicao na criacao") sairam junto com a criacao TIMED. A conta do
  // endAt continua coberta por "remarcar recalcula endAt" e pelo teste
  // unitario de computeEndAt; a sobreposicao, pela remarcacao abaixo e pelo
  // teste unitario de detectOverlap.
  it("endAt fica CONGELADO: alterar a duração do Product depois não move agendamentos já criados", async () => {
    const created = await createTimedAppointment(businessId, {
      clientId,
      startAt: new Date("2026-04-02T10:00:00Z"),
      services: [{ productId: haircutId }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Editar o Product diretamente (fora do fluxo de Agenda) - simula o
    // "editar produto" já existente no formulário de venda.
    await prisma.product.update({ where: { id: haircutId }, data: { durationMinutes: 90 } });

    const appointment = await getAppointmentById(businessId, created.value.id);
    // endAt continua com a duração ORIGINAL (30 min), não a nova (90 min).
    expect(appointment?.endAt?.toISOString()).toBe("2026-04-02T10:30:00.000Z");
    expect(appointment?.services[0].durationMinutesSnapshot).toBe(30);

    // Restaura pro resto da suíte não depender de ordem de execução.
    await prisma.product.update({ where: { id: haircutId }, data: { durationMinutes: 30 } });
  });

  it("remarcar recalcula endAt a partir do novo startAt e dos serviços enviados", async () => {
    const created = await createTimedAppointment(businessId, {
      clientId,
      startAt: new Date("2026-04-03T10:00:00Z"),
      services: [{ productId: haircutId }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateAppointment(businessId, created.value.id, {
      clientId,
      startAt: new Date("2026-04-03T14:00:00Z"),
      services: [{ productId: haircutId }, { productId: beardId }],
    });
    expect(updated.ok).toBe(true);

    const appointment = await getAppointmentById(businessId, created.value.id);
    expect(appointment?.startAt?.toISOString()).toBe("2026-04-03T14:00:00.000Z");
    expect(appointment?.endAt?.toISOString()).toBe("2026-04-03T14:50:00.000Z");
    expect(appointment?.services.map((s) => s.productId)).toEqual([haircutId, beardId]);
  });

  it("editar serviços nunca colide com @@unique(appointmentId, position) - deleteMany + createMany na mesma transação", async () => {
    const created = await createTimedAppointment(businessId, {
      clientId,
      startAt: new Date("2026-04-04T10:00:00Z"),
      services: [{ productId: haircutId }, { productId: beardId }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Reduz pra 1 servico, depois volta pra 2 - testa os dois sentidos da
    // substituição (encolher e crescer o conjunto).
    const shrink = await updateAppointment(businessId, created.value.id, {
      clientId,
      startAt: new Date("2026-04-04T10:00:00Z"),
      services: [{ productId: beardId }],
    });
    expect(shrink.ok).toBe(true);

    const grow = await updateAppointment(businessId, created.value.id, {
      clientId,
      startAt: new Date("2026-04-04T10:00:00Z"),
      services: [{ productId: haircutId }, { productId: beardId }, { productId: haircutId }],
    });
    expect(grow.ok).toBe(true);

    const positions = await prisma.appointmentService.findMany({ where: { appointmentId: created.value.id }, orderBy: { position: "asc" } });
    expect(positions.map((p) => p.position)).toEqual([0, 1, 2]);
  });

  it("sobreposição ao remarcar é AVISO: rejeita sem allowOverlap, aceita com allowOverlap:true", async () => {
    const first = await createTimedAppointment(businessId, {
      clientId,
      startAt: new Date("2026-04-05T10:00:00Z"),
      services: [{ productId: haircutId }], // 10:00-10:30
    });
    const second = await createTimedAppointment(businessId, {
      clientId,
      startAt: new Date("2026-04-05T12:00:00Z"),
      services: [{ productId: beardId }],
    });
    if (!first.ok || !second.ok) throw new Error("fixture");

    const moveInto = { clientId, startAt: new Date("2026-04-05T10:15:00Z"), services: [{ productId: beardId }] }; // dentro do primeiro
    const conflicting = await updateAppointment(businessId, second.value.id, moveInto);
    expect(conflicting.ok).toBe(false);
    if (!conflicting.ok) expect(conflicting.conflicts?.map((c) => c.id)).toEqual([first.value.id]);

    expect((await updateAppointment(businessId, second.value.id, { ...moveInto, allowOverlap: true })).ok).toBe(true);
  });

  it("remarcar exclui o próprio agendamento da checagem de sobreposição (remarcar pro mesmo horário não conflita consigo mesmo)", async () => {
    const created = await createTimedAppointment(businessId, {
      clientId,
      startAt: new Date("2026-04-06T10:00:00Z"),
      services: [{ productId: haircutId }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // "Remarcar" pro mesmo horário que já está - sem excludeId isso daria
    // falso positivo de conflito contra si mesmo.
    const result = await updateAppointment(businessId, created.value.id, {
      clientId,
      startAt: new Date("2026-04-06T10:00:00Z"),
      services: [{ productId: haircutId }],
    });
    expect(result.ok).toBe(true);
  });
});
