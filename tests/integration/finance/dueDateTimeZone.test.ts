import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createBill } from "@/lib/finance/bills/mutations";
import { getBillSummary, listBills } from "@/lib/finance/bills/queries";
import { createClient } from "@/lib/clients/mutations";
import { getClientFinancialSummary } from "@/lib/clients/queries";
import { createSale } from "@/lib/sales/mutations";
import { getSalesSummary } from "@/lib/sales/queries";
import { getMonthlyCashSeries } from "@/lib/finance/cash/queries";
import { dateKeyToDbDate } from "@/lib/time/zoned";

// Etapa F3b: contas, vendas, clientes e caixa no FUSO DA EMPRESA, nunca no do
// processo. Relogio fixo e instantes em UTC explicito: o resultado e o mesmo
// com o processo em UTC, Asia/Tokyo ou America/New_York (matriz da F3b).
//
// Cenario central: 25/10 15:30Z = 00:30 de 26/10 em Tóquio, com o dia UTC
// ainda em 25/10 - exatamente a janela 00:00-09:00 JST em que um servidor em
// UTC (ou um teste que monte a data em UTC) erraria o "hoje".
const TOKYO_0030 = { now: new Date("2026-10-25T15:30:00Z"), timeZone: "Asia/Tokyo" };
const UTC_SAME_INSTANT = { now: TOKYO_0030.now, timeZone: "UTC" };
const apiDate = dateKeyToDbDate; // como a API grava "YYYY-MM-DD" hoje

describe("vencimento, vendas, clientes e caixa no fuso da empresa (Etapa F3b)", () => {
  let userId: string;
  let businessId: string;
  let expenseCategoryId: string;
  let revenueCategoryId: string;

  beforeAll(async () => {
    const [expense, revenue] = await Promise.all([
      prisma.category.findFirstOrThrow({ where: { businessId: null, type: "EXPENSE" } }),
      prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } }),
    ]);
    expenseCategoryId = expense.id;
    revenueCategoryId = revenue.id;
    const user = await prisma.user.create({
      data: {
        name: "Teste F3b",
        email: `f3b-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    userId = user.id;
    businessId = (await prisma.business.create({ data: { userId, name: "Empresa F3b", currency: "BRL" } })).id;
  });

  afterAll(async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.bill.deleteMany({ where: { businessId } });
    await prisma.saleItem.deleteMany({ where: { sale: { businessId } } });
    await prisma.sale.deleteMany({ where: { businessId } });
    await prisma.client.deleteMany({ where: { businessId } });
    await prisma.business.deleteMany({ where: { id: businessId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("contas a pagar às 00:30 JST: a de 26/10 vence hoje e a de 25/10 está vencida (empresa Tóquio); em UTC é o contrário do 'hoje'", async () => {
    for (const [description, key, amount] of [
      ["Vence hoje (Tóquio)", "2026-10-26", 100],
      ["Venceu ontem (Tóquio)", "2026-10-25", 40],
    ] as const) {
      const created = await createBill(businessId, "PAYABLE", { categoryId: expenseCategoryId, description, amount, dueDate: apiDate(key) });
      expect(created.ok).toBe(true);
    }

    const tokyo = await getBillSummary(businessId, "PAYABLE", { start: TOKYO_0030.now, end: TOKYO_0030.now }, TOKYO_0030);
    expect(tokyo.dueTodayCount).toBe(1);
    expect(tokyo.dueTodayAmount.toNumber()).toBe(100);
    expect(tokyo.totalOverdueAmount.toNumber()).toBe(40);
    expect(tokyo.totalPendingAmount.toNumber()).toBe(100);
    expect(tokyo.dueNext7Count).toBe(1);

    const overdue = await listBills(businessId, { direction: "PAYABLE", displayStatus: "OVERDUE" }, TOKYO_0030);
    expect(overdue.items.map((b) => b.description)).toEqual(["Venceu ontem (Tóquio)"]);
    const pending = await listBills(businessId, { direction: "PAYABLE", displayStatus: "PENDING" }, TOKYO_0030);
    expect(pending.items.map((b) => b.description)).toEqual(["Vence hoje (Tóquio)"]);

    // Mesmo instante, empresa em UTC: ainda é 25/10 - a de 25/10 vence hoje.
    const utc = await getBillSummary(businessId, "PAYABLE", { start: UTC_SAME_INSTANT.now, end: UTC_SAME_INSTANT.now }, UTC_SAME_INSTANT);
    expect(utc.dueTodayAmount.toNumber()).toBe(40);
    expect(utc.totalOverdueAmount.toNumber()).toBe(0);
    const utcOverdue = await listBills(businessId, { direction: "PAYABLE", displayStatus: "OVERDUE" }, UTC_SAME_INSTANT);
    expect(utcOverdue.items).toHaveLength(0);
  });

  it("vendas e clientes: parcela de 25/10 conta como vencida em Tóquio às 00:30 JST e como em aberto em UTC", async () => {
    const client = await createClient(businessId, { name: "Cliente F3b", clientType: "PESSOA_FISICA" });
    if (!client.ok) throw new Error(client.error);
    const sale = await createSale(businessId, userId, {
      clientRequestId: randomUUID(),
      status: "CONFIRMED",
      clientId: client.value.id,
      categoryId: revenueCategoryId,
      saleDate: apiDate("2026-10-20"),
      items: [{ description: "Serviço", quantity: 1, unitPrice: 300 }],
      discount: null,
      paymentMethod: null,
      installments: [
        { dueDate: apiDate("2026-10-25"), amount: 100 },
        { dueDate: apiDate("2026-10-26"), amount: 200 },
      ],
      notes: null,
    });
    if (!sale.ok) throw new Error(sale.error);

    const range = { start: new Date("2026-10-01T00:00:00Z"), end: new Date("2026-11-01T00:00:00Z") };
    const tokyoSales = await getSalesSummary(businessId, range, TOKYO_0030);
    expect(tokyoSales.totalOverdue.toNumber()).toBe(100);
    expect(tokyoSales.totalPending.toNumber()).toBe(200);
    const utcSales = await getSalesSummary(businessId, range, UTC_SAME_INSTANT);
    expect(utcSales.totalOverdue.toNumber()).toBe(0);
    expect(utcSales.totalPending.toNumber()).toBe(300);

    const tokyoClient = await getClientFinancialSummary(businessId, client.value.id, TOKYO_0030);
    expect(tokyoClient.totalOverdueAmount.toNumber()).toBe(100);
    expect(tokyoClient.totalOpenAmount.toNumber()).toBe(200);
    const spClient = await getClientFinancialSummary(businessId, client.value.id, {
      now: new Date("2026-10-26T02:00:00Z"), // 23:00 de 25/10 em São Paulo
      timeZone: "America/Sao_Paulo",
    });
    // Em SP, 25/10 00:00Z é 24/10 21:00 (a representação gravada é UTC - F6):
    // a parcela "25/10" já é de ontem; a "26/10" é 25/10 21:00 = hoje.
    expect(spClient.totalOverdueAmount.toNumber()).toBe(100);
    expect(spClient.totalOpenAmount.toNumber()).toBe(200);
  });

  it("caixa: a virada de mês segue o fuso da empresa (01:00 JST de 01/11 já é novembro em Tóquio, ainda outubro em UTC)", async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: { openingBalance: new Prisma.Decimal(1000), openingBalanceDate: new Date("2026-09-30T00:00:00Z") },
    });
    await prisma.financialEntry.createMany({
      data: [
        { businessId, userId, type: "REVENUE", categoryId: revenueCategoryId, description: "Outubro", amount: "50", occurredAt: new Date("2026-10-15T00:00:00Z") },
        { businessId, userId, type: "REVENUE", categoryId: revenueCategoryId, description: "01/11 JST", amount: "100", occurredAt: new Date("2026-10-31T16:00:00Z") },
      ],
    });
    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const now = new Date("2026-10-31T16:30:00Z");

    const tokyo = await getMonthlyCashSeries(businessId, business, { now, timeZone: "Asia/Tokyo" });
    expect(tokyo.map((p) => [p.year, p.month, p.balance.toNumber()])).toEqual([
      [2026, 8, 1000],
      [2026, 9, 1050],
      [2026, 10, 1150],
    ]);

    const utc = await getMonthlyCashSeries(businessId, business, { now, timeZone: "UTC" });
    expect(utc.map((p) => [p.year, p.month, p.balance.toNumber()])).toEqual([
      [2026, 8, 1000],
      [2026, 9, 1150],
    ]);
  });
});
