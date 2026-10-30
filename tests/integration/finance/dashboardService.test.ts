import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { getDashboardData } from "@/lib/finance/dashboardService";
import { listTransactions } from "@/lib/finance/queries";
import { PROCESS_TZ, processClock } from "../../helpers/processClock";
import { dbDateOfInstant } from "@/lib/time/zoned";

function sumAmounts(items: { amount: { toNumber: () => number } }[]): number {
  return items.reduce((total, item) => total + item.amount.toNumber(), 0);
}

describe("getDashboardData - consistência cruzada e isolamento (Etapa 4)", () => {
  let userAId: string;
  let userBId: string;
  let businessAId: string;
  let businessBId: string;
  let revenueCategoryId: string;
  let costCategoryId: string;
  let expenseCategoryId: string;

  beforeAll(async () => {
    const [revenueCategory, costCategory, expenseCategory] = await Promise.all([
      prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } }),
      prisma.category.findFirstOrThrow({ where: { businessId: null, type: "COST" } }),
      prisma.category.findFirstOrThrow({ where: { businessId: null, type: "EXPENSE" } }),
    ]);
    revenueCategoryId = revenueCategory.id;
    costCategoryId = costCategory.id;
    expenseCategoryId = expenseCategory.id;

    const userA = await prisma.user.create({
      data: {
        name: "Dashboard A",
        email: `dash-a-${Date.now()}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    const userB = await prisma.user.create({
      data: {
        name: "Dashboard B",
        email: `dash-b-${Date.now()}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    userAId = userA.id;
    userBId = userB.id;

    const businessA = await prisma.business.create({
      data: { userId: userA.id, name: "Empresa A", currency: "BRL" },
    });
    const businessB = await prisma.business.create({
      data: { userId: userB.id, name: "Empresa B", currency: "BRL" },
    });
    businessAId = businessA.id;
    businessBId = businessB.id;

    const now = new Date();
    await prisma.financialEntry.createMany({
      data: [
        {
          businessId: businessAId,
          userId: userAId,
          type: "REVENUE",
          categoryId: revenueCategoryId,
          description: "Venda A1",
          amount: "1000",
          occurredAt: now, occurredOn: dbDateOfInstant(now, "Asia/Tokyo"),
        },
        {
          businessId: businessAId,
          userId: userAId,
          type: "REVENUE",
          categoryId: revenueCategoryId,
          description: "Venda A2",
          amount: "500",
          occurredAt: now, occurredOn: dbDateOfInstant(now, "Asia/Tokyo"),
        },
        {
          businessId: businessAId,
          userId: userAId,
          type: "COST",
          categoryId: costCategoryId,
          description: "Mercadoria A",
          amount: "400",
          occurredAt: now, occurredOn: dbDateOfInstant(now, "Asia/Tokyo"),
        },
        {
          businessId: businessAId,
          userId: userAId,
          type: "EXPENSE",
          categoryId: expenseCategoryId,
          description: "Aluguel A",
          amount: "200",
          occurredAt: now, occurredOn: dbDateOfInstant(now, "Asia/Tokyo"),
        },
        // Empresa B - nunca deveria aparecer no dashboard de A.
        {
          businessId: businessBId,
          userId: userBId,
          type: "REVENUE",
          categoryId: revenueCategoryId,
          description: "Venda B",
          amount: "99999",
          occurredAt: now, occurredOn: dbDateOfInstant(now, "Asia/Tokyo"),
        },
      ],
    });
  });

  it("os totais do dashboard batem exatamente com a soma de listTransactions (Receitas/Custos/Despesas) no mesmo período - ADENDO da Etapa 4", async () => {
    const data = await getDashboardData(businessAId, "BRL", "Este mês", {
      period: "THIS_MONTH",
      comparison: "NONE",
    }, processClock());

    const [revenueTx, costTx, expenseTx] = await Promise.all([
      // data.range foi resolvido no fuso do relogio (processClock); o filtro
      // de periodo exige o mesmo fuso (F6b-2).
      listTransactions(businessAId, { type: "REVENUE", range: data.range, pageSize: 100 }, PROCESS_TZ),
      listTransactions(businessAId, { type: "COST", range: data.range, pageSize: 100 }, PROCESS_TZ),
      listTransactions(businessAId, { type: "EXPENSE", range: data.range, pageSize: 100 }, PROCESS_TZ),
    ]);

    expect(data.summary.revenue.toNumber()).toBe(sumAmounts(revenueTx.items));
    expect(data.summary.costs.toNumber()).toBe(sumAmounts(costTx.items));
    expect(data.summary.expenses.toNumber()).toBe(sumAmounts(expenseTx.items));
    expect(data.summary.revenue.toNumber()).toBe(1500);
    expect(data.summary.costs.toNumber()).toBe(400);
    expect(data.summary.expenses.toNumber()).toBe(200);
  });

  it("dashboard da empresa A nunca inclui lançamentos da empresa B (isolamento)", async () => {
    const data = await getDashboardData(businessAId, "BRL", "Este mês", {
      period: "THIS_MONTH",
      comparison: "NONE",
    }, processClock());
    expect(data.summary.revenue.toNumber()).toBe(1500); // não 1500 + 99999 da empresa B
    expect(data.topCategories.grandTotal.toNumber()).toBe(600); // 400 (custo) + 200 (despesa) de A
  });

  afterAll(async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
    await prisma.business.deleteMany({ where: { id: { in: [businessAId, businessBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  });
});
