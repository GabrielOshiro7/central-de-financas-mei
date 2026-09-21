import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createAppointment, changeAppointmentStatus, completeAppointment } from "@/lib/agenda/mutations";
import { getAppointmentById, getLastUsedCompletionCategoryId } from "@/lib/agenda/queries";
import { resolveSaleDateFromAppointment } from "@/lib/agenda/calculations";
import { createSale } from "@/lib/sales/mutations";

describe("agenda - concluir atendimento", () => {
  let userId: string;
  let businessId: string;
  let clientId: string;
  let serviceId: string;
  let revenueCategoryId: string;
  let otherBusinessRevenueCategoryId: string;
  let otherBusinessId: string;
  let otherUserId: string;
  let inactiveCategoryId: string;
  let expenseCategoryId: string;

  beforeAll(async () => {
    const revenueCategory = await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } });
    revenueCategoryId = revenueCategory.id;
    const expenseCategory = await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "EXPENSE" } });
    expenseCategoryId = expenseCategory.id;

    const user = await prisma.user.create({
      data: { name: "Teste Agenda Complete", email: `agenda-complete-${Date.now()}@example.com`, passwordHash: await hashPassword("SenhaValida123") },
    });
    userId = user.id;
    const business = await prisma.business.create({ data: { userId, name: "Empresa Agenda Complete", currency: "BRL" } });
    businessId = business.id;
    const client = await prisma.client.create({ data: { businessId, name: "Cliente Complete", clientType: "PESSOA_FISICA" } });
    clientId = client.id;
    const service = await prisma.product.create({
      data: { businessId, name: "Corte", type: "SERVICO", durationMinutes: 30, defaultPrice: new Prisma.Decimal(50) },
    });
    serviceId = service.id;

    const inactiveCategory = await prisma.category.create({
      data: { businessId, name: "Categoria Inativa Teste", normalizedName: `categoria inativa teste ${Date.now()}`, type: "REVENUE", active: false },
    });
    inactiveCategoryId = inactiveCategory.id;

    // Empresa separada, so pra provar que categoryId de outra empresa e
    // rejeitado (categoria propria, businessId preenchido - nao e uma
    // categoria padrao do sistema).
    const otherUser = await prisma.user.create({
      data: { name: "Outra Empresa", email: `agenda-complete-other-${Date.now()}@example.com`, passwordHash: await hashPassword("SenhaValida123") },
    });
    otherUserId = otherUser.id;
    const otherBusiness = await prisma.business.create({ data: { userId: otherUserId, name: "Outra Empresa Agenda", currency: "BRL" } });
    otherBusinessId = otherBusiness.id;
    const otherCategory = await prisma.category.create({
      data: { businessId: otherBusinessId, name: "Categoria Outra Empresa", normalizedName: `categoria outra empresa ${Date.now()}`, type: "REVENUE" },
    });
    otherBusinessRevenueCategoryId = otherCategory.id;
  });

  afterAll(async () => {
    await prisma.appointmentService.deleteMany({ where: { appointment: { businessId: { in: [businessId, otherBusinessId] } } } });
    await prisma.appointment.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } });
    await prisma.bill.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } });
    await prisma.financialEntry.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } });
    await prisma.sale.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } });
    await prisma.category.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.client.deleteMany({ where: { businessId } });
    await prisma.business.deleteMany({ where: { id: { in: [businessId, otherBusinessId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  });

  async function createOne(startAt: string) {
    const created = await createAppointment(businessId, { clientId, startAt: new Date(startAt), services: [{ productId: serviceId }] });
    if (!created.ok) throw new Error("setup falhou: " + created.error);
    return created.value.id;
  }

  it("concluir à vista cria Sale CONFIRMED + 1 Bill PAID + FinancialEntry, com Bill.paidAt === saleDate (nunca completedAt)", async () => {
    const id = await createOne("2026-06-01T10:00:00Z");
    const startAt = new Date("2026-06-01T10:00:00Z");

    const result = await completeAppointment(businessId, userId, id, {
      categoryId: revenueCategoryId,
      items: [{ productId: serviceId, description: "Corte", quantity: 1, unitPrice: 50 }],
      installments: [{ dueDate: "2026-06-01", amount: 50, paidNow: true }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: result.value.saleId }, include: { bills: true, items: true } });
    expect(sale.status).toBe("CONFIRMED");
    expect(sale.total.toString()).toBe("50");
    expect(sale.bills).toHaveLength(1);
    expect(sale.bills[0].status).toBe("PAID");

    const expectedSaleDate = resolveSaleDateFromAppointment(startAt);
    expect(sale.saleDate.getTime()).toBe(expectedSaleDate.getTime());
    // Requisito explícito: Bill.paidAt é o MESMO instante de saleDate, nunca
    // "agora"/completedAt.
    expect(sale.bills[0].paidAt).not.toBeNull();
    expect(sale.bills[0].paidAt!.getTime()).toBe(sale.saleDate.getTime());

    const entry = await prisma.financialEntry.findFirst({ where: { billId: sale.bills[0].id } });
    expect(entry).not.toBeNull();
    expect(entry!.occurredAt.getTime()).toBe(sale.saleDate.getTime());

    const appointment = await getAppointmentById(businessId, id);
    expect(appointment?.status).toBe("CONCLUIDO");
    expect(appointment?.saleId).toBe(sale.id);
  });

  it("concluir a prazo cria Sale + N Bills PENDING, sem FinancialEntry", async () => {
    const id = await createOne("2026-06-02T10:00:00Z");

    const result = await completeAppointment(businessId, userId, id, {
      categoryId: revenueCategoryId,
      items: [{ productId: serviceId, description: "Corte", quantity: 1, unitPrice: 100 }],
      installments: [
        { dueDate: "2026-06-15", amount: 50 },
        { dueDate: "2026-07-01", amount: 50 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: result.value.saleId }, include: { bills: true } });
    expect(sale.bills).toHaveLength(2);
    expect(sale.bills.every((b) => b.status === "PENDING")).toBe(true);

    const entries = await prisma.financialEntry.findMany({ where: { billId: { in: sale.bills.map((b) => b.id) } } });
    expect(entries).toHaveLength(0);
  });

  it("diretriz 1: saleDate de uma conclusão é byte-a-byte igual ao de uma venda manual criada no mesmo dia calendário", async () => {
    const id = await createOne("2026-06-03T14:30:00Z"); // 23:30 de 3/jun em Toquio (UTC+9) -> ainda dia 3

    const completed = await completeAppointment(businessId, userId, id, {
      categoryId: revenueCategoryId,
      items: [{ description: "Corte", quantity: 1, unitPrice: 50 }],
      installments: [{ dueDate: "2026-06-03", amount: 50, paidNow: true }],
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    const saleFromAgenda = await prisma.sale.findUniqueOrThrow({ where: { id: completed.value.saleId } });

    // Venda manual do MESMO dia calendário (3/jun), criada direto via
    // createSale - o mesmo caminho que api/vendas/route.ts usa
    // (new Date("2026-06-03")).
    const manualSale = await createSale(businessId, userId, {
      clientRequestId: `manual-comparacao-${Date.now()}`,
      status: "CONFIRMED",
      clientId,
      categoryId: revenueCategoryId,
      saleDate: new Date("2026-06-03"),
      items: [{ description: "Venda manual de comparação", quantity: 1, unitPrice: 10 }],
      discount: null,
      installments: [{ dueDate: new Date("2026-06-03"), amount: 10, paidNow: true }],
    });
    expect(manualSale.ok).toBe(true);
    if (!manualSale.ok) return;
    const manualSaleRow = await prisma.sale.findUniqueOrThrow({ where: { id: manualSale.value.id } });

    expect(saleFromAgenda.saleDate.getTime()).toBe(manualSaleRow.saleDate.getTime());
    expect(saleFromAgenda.saleDate.toISOString()).toBe("2026-06-03T00:00:00.000Z");
  });

  it("concluir 2x sequencial gera UMA única Sale (idempotente)", async () => {
    const id = await createOne("2026-06-04T10:00:00Z");
    const input = {
      categoryId: revenueCategoryId,
      items: [{ description: "Corte", quantity: 1, unitPrice: 50 }],
      installments: [{ dueDate: "2026-06-04", amount: 50, paidNow: true }],
    };

    const first = await completeAppointment(businessId, userId, id, input);
    const second = await completeAppointment(businessId, userId, id, input);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.value.alreadyCompleted).toBe(true);
    expect(second.value.saleId).toBe(first.value.saleId);

    const salesForAppointment = await prisma.sale.findMany({ where: { businessId, clientRequestId: `agenda:${id}` } });
    expect(salesForAppointment).toHaveLength(1);
  });

  it("concluir 2x em paralelo (Promise.all, chamada real concorrente, sem test.concurrent) gera UMA única Sale", async () => {
    const id = await createOne("2026-06-05T10:00:00Z");
    const input = {
      categoryId: revenueCategoryId,
      items: [{ description: "Corte", quantity: 1, unitPrice: 50 }],
      installments: [{ dueDate: "2026-06-05", amount: 50, paidNow: true }],
    };

    const [resultA, resultB] = await Promise.all([
      completeAppointment(businessId, userId, id, input),
      completeAppointment(businessId, userId, id, input),
    ]);

    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);
    if (!resultA.ok || !resultB.ok) return;

    expect(resultA.value.saleId).toBe(resultB.value.saleId);
    // Exatamente uma das duas chamadas de fato criou a venda; a outra
    // encontrou o resultado já existente.
    expect([resultA.value.alreadyCompleted, resultB.value.alreadyCompleted].filter(Boolean)).toHaveLength(1);

    const salesForAppointment = await prisma.sale.findMany({ where: { businessId, clientRequestId: `agenda:${id}` } });
    expect(salesForAppointment).toHaveLength(1);
  });

  it("concluir com preço editado no momento reflete o preço editado, não o defaultPrice do Product", async () => {
    const id = await createOne("2026-06-06T10:00:00Z");
    const result = await completeAppointment(businessId, userId, id, {
      categoryId: revenueCategoryId,
      items: [{ productId: serviceId, description: "Corte (promoção)", quantity: 1, unitPrice: 35 }], // defaultPrice do Product é 50
      installments: [{ dueDate: "2026-06-06", amount: 35, paidNow: true }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: result.value.saleId }, include: { items: true } });
    expect(sale.total.toString()).toBe("35");
    expect(sale.items[0].unitPrice.toString()).toBe("35");
  });

  it("categoria de outra empresa é rejeitada", async () => {
    const id = await createOne("2026-06-07T10:00:00Z");
    const result = await completeAppointment(businessId, userId, id, {
      categoryId: otherBusinessRevenueCategoryId,
      items: [{ description: "Corte", quantity: 1, unitPrice: 50 }],
      installments: [{ dueDate: "2026-06-07", amount: 50, paidNow: true }],
    });
    expect(result.ok).toBe(false);

    const appointment = await getAppointmentById(businessId, id);
    expect(appointment?.status).toBe("AGENDADO"); // nada foi persistido - a transação inteira reverteu
    expect(appointment?.saleId).toBeNull();
  });

  it("categoria inativa é rejeitada", async () => {
    const id = await createOne("2026-06-08T10:00:00Z");
    const result = await completeAppointment(businessId, userId, id, {
      categoryId: inactiveCategoryId,
      items: [{ description: "Corte", quantity: 1, unitPrice: 50 }],
      installments: [{ dueDate: "2026-06-08", amount: 50, paidNow: true }],
    });
    expect(result.ok).toBe(false);
  });

  it("categoria do tipo errado (EXPENSE) é rejeitada", async () => {
    const id = await createOne("2026-06-09T10:00:00Z");
    const result = await completeAppointment(businessId, userId, id, {
      categoryId: expenseCategoryId,
      items: [{ description: "Corte", quantity: 1, unitPrice: 50 }],
      installments: [{ dueDate: "2026-06-09", amount: 50, paidNow: true }],
    });
    expect(result.ok).toBe(false);
  });

  it("concluir um agendamento CANCELADO é rejeitado, sem criar nenhuma Sale", async () => {
    const id = await createOne("2026-06-10T10:00:00Z");
    await changeAppointmentStatus(businessId, id, "CANCELADO");

    const result = await completeAppointment(businessId, userId, id, {
      categoryId: revenueCategoryId,
      items: [{ description: "Corte", quantity: 1, unitPrice: 50 }],
      installments: [{ dueDate: "2026-06-10", amount: 50, paidNow: true }],
    });
    expect(result.ok).toBe(false);

    const salesForAppointment = await prisma.sale.findMany({ where: { businessId, clientRequestId: `agenda:${id}` } });
    expect(salesForAppointment).toHaveLength(0);
  });

  it("getLastUsedCompletionCategoryId: null sem nenhuma conclusão prévia; devolve a categoria depois de uma conclusão", async () => {
    // Empresa isolada só pra este teste, pra não depender da ordem dos
    // testes anteriores (que já concluíram atendimentos em `businessId`).
    const freshUser = await prisma.user.create({
      data: { name: "Teste Categoria Sugerida", email: `agenda-suggest-${Date.now()}@example.com`, passwordHash: await hashPassword("SenhaValida123") },
    });
    const freshBusiness = await prisma.business.create({ data: { userId: freshUser.id, name: "Empresa Categoria Sugerida", currency: "BRL" } });
    const freshClient = await prisma.client.create({ data: { businessId: freshBusiness.id, name: "Cliente", clientType: "PESSOA_FISICA" } });
    const freshService = await prisma.product.create({
      data: { businessId: freshBusiness.id, name: "Corte", type: "SERVICO", durationMinutes: 30, defaultPrice: new Prisma.Decimal(50) },
    });

    try {
      const before = await getLastUsedCompletionCategoryId(freshBusiness.id);
      expect(before).toBeNull(); // modal exige seleção manual nesse caso

      const created = await createAppointment(freshBusiness.id, {
        clientId: freshClient.id,
        startAt: new Date("2026-06-11T10:00:00Z"),
        services: [{ productId: freshService.id }],
      });
      if (!created.ok) throw new Error("setup falhou");

      const completed = await completeAppointment(freshBusiness.id, freshUser.id, created.value.id, {
        categoryId: revenueCategoryId,
        items: [{ description: "Corte", quantity: 1, unitPrice: 50 }],
        installments: [{ dueDate: "2026-06-11", amount: 50, paidNow: true }],
      });
      expect(completed.ok).toBe(true);

      const after = await getLastUsedCompletionCategoryId(freshBusiness.id);
      expect(after).toBe(revenueCategoryId);
    } finally {
      await prisma.appointmentService.deleteMany({ where: { appointment: { businessId: freshBusiness.id } } });
      await prisma.appointment.deleteMany({ where: { businessId: freshBusiness.id } });
      await prisma.bill.deleteMany({ where: { businessId: freshBusiness.id } });
      await prisma.financialEntry.deleteMany({ where: { businessId: freshBusiness.id } });
      await prisma.sale.deleteMany({ where: { businessId: freshBusiness.id } });
      await prisma.product.deleteMany({ where: { businessId: freshBusiness.id } });
      await prisma.client.deleteMany({ where: { businessId: freshBusiness.id } });
      await prisma.business.delete({ where: { id: freshBusiness.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: freshUser.id } }).catch(() => {});
    }
  });
});
