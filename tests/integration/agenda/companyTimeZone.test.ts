import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createAppointment, completeAppointment } from "@/lib/agenda/mutations";
import { listAppointmentsForMonth } from "@/lib/agenda/queries";
import { parseAgendaDateTimeInput } from "@/lib/agenda/time";

// Etapa F3c: a Agenda segue o FUSO DA EMPRESA (Business.timezone), nao mais o
// fuso fixo de Toquio. Instantes em UTC explicito: o resultado e o mesmo com
// o processo em UTC, Asia/Tokyo ou America/New_York.
describe("agenda no fuso da empresa (Etapa F3c)", () => {
  let userId: string;
  let businessId: string;
  let clientId: string;
  let serviceId: string;
  let revenueCategoryId: string;

  beforeAll(async () => {
    revenueCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } })).id;
    const user = await prisma.user.create({
      data: {
        name: "Teste Agenda Fuso",
        email: `agenda-tz-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    userId = user.id;
    const business = await prisma.business.create({
      data: { userId, name: "Empresa Agenda SP", currency: "BRL", country: "BR", timezone: "America/Sao_Paulo" },
    });
    businessId = business.id;
    clientId = (await prisma.client.create({ data: { businessId, name: "Cliente SP", clientType: "PESSOA_FISICA" } })).id;
    serviceId = (
      await prisma.product.create({
        data: { businessId, name: "Corte", type: "SERVICO", durationMinutes: 30, defaultPrice: new Prisma.Decimal(50) },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.appointmentService.deleteMany({ where: { appointment: { businessId } } });
    await prisma.appointment.deleteMany({ where: { businessId } });
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.bill.deleteMany({ where: { businessId } });
    await prisma.saleItem.deleteMany({ where: { sale: { businessId } } });
    await prisma.sale.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.client.deleteMany({ where: { businessId } });
    await prisma.business.deleteMany({ where: { id: businessId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("31/10 22:00 em São Paulo (= 01/11 01:00Z, já novembro em Tóquio/UTC) pertence a outubro para a empresa em SP", async () => {
    const startAt = parseAgendaDateTimeInput("2026-10-31T22:00", "America/Sao_Paulo");
    expect(startAt.toISOString()).toBe("2026-11-01T01:00:00.000Z");
    const created = await createAppointment(businessId, { clientId, startAt, services: [{ productId: serviceId }] });
    if (!created.ok) throw new Error(created.error);

    const octoberSp = await listAppointmentsForMonth(businessId, 2026, 10, "America/Sao_Paulo");
    const novemberSp = await listAppointmentsForMonth(businessId, 2026, 11, "America/Sao_Paulo");
    expect(octoberSp.map((a) => a.id)).toContain(created.value.id);
    expect(novemberSp.map((a) => a.id)).not.toContain(created.value.id);

    // Mesmo agendamento com o fuso fixo antigo (Tóquio) cairia em novembro.
    const novemberTokyo = await listAppointmentsForMonth(businessId, 2026, 11, "Asia/Tokyo");
    expect(novemberTokyo.map((a) => a.id)).toContain(created.value.id);
  });

  it("concluir à vista: saleDate e paidAt são o dia do atendimento em São Paulo (31/10), não o de Tóquio (01/11)", async () => {
    const startAt = parseAgendaDateTimeInput("2026-10-31T23:00", "America/Sao_Paulo"); // 01/11 02:00Z
    const created = await createAppointment(businessId, { clientId, startAt, services: [{ productId: serviceId }], allowOverlap: true });
    if (!created.ok) throw new Error(created.error);

    const result = await completeAppointment(
      businessId,
      userId,
      created.value.id,
      {
        categoryId: revenueCategoryId,
        items: [{ productId: serviceId, description: "Corte", quantity: 1, unitPrice: 50 }],
        installments: [{ dueDate: "2026-10-31", amount: 50, paidNow: true }],
      },
      "America/Sao_Paulo"
    );
    if (!result.ok) throw new Error(result.error);

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: result.value.saleId }, include: { bills: true } });
    // Mesma representacao de uma venda manual de "2026-10-31" (meia-noite UTC
    // da string - a forma de gravar so muda na F6).
    expect(sale.saleDate.toISOString()).toBe("2026-10-31T00:00:00.000Z");
    expect(sale.bills[0].paidAt?.toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });
});
