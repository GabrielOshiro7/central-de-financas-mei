import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { getFinancialSummary } from "@/lib/finance/queries";
import { processClock } from "../helpers/processClock";

describe("resumo financeiro (dados inseridos diretamente no banco de teste)", () => {
  let userId: string;
  let businessId: string;
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
  });

  it("calcula lucro, margem líquida e margem bruta a partir de lançamentos reais", async () => {
    const user = await prisma.user.create({
      data: {
        name: "Teste Financeiro",
        email: `financeiro-${Date.now()}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    userId = user.id;

    const business = await prisma.business.create({
      data: { userId: user.id, name: "Empresa Teste", currency: "BRL" },
    });
    businessId = business.id;

    const now = new Date();
    await prisma.financialEntry.createMany({
      data: [
        {
          businessId,
          userId,
          type: "REVENUE",
          categoryId: revenueCategoryId,
          description: "Venda",
          amount: "1000",
          occurredAt: now,
        },
        {
          businessId,
          userId,
          type: "COST",
          categoryId: costCategoryId,
          description: "Mercadoria",
          amount: "400",
          occurredAt: now,
        },
        {
          businessId,
          userId,
          type: "EXPENSE",
          categoryId: expenseCategoryId,
          description: "Aluguel",
          amount: "100",
          occurredAt: now,
        },
      ],
    });

    const summary = await getFinancialSummary(businessId, "THIS_MONTH", processClock(now));

    expect(summary.revenue.toString()).toBe("1000");
    expect(summary.costs.toString()).toBe("400");
    expect(summary.expenses.toString()).toBe("100");
    expect(summary.netProfit.toString()).toBe("500");
    expect(summary.netMargin?.toNumber()).toBe(50);
    // margem bruta = (1000 - 400) / 1000 * 100 = 60
    expect(summary.grossMargin?.toNumber()).toBe(60);
  });

  it("faturamento zero no período retorna margens null (N/A), sem erro de divisão por zero", async () => {
    const now = new Date();
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.financialEntry.create({
      data: {
        businessId,
        userId,
        type: "COST",
        categoryId: costCategoryId,
        description: "Mercadoria",
        amount: "200",
        occurredAt: now,
      },
    });

    const summary = await getFinancialSummary(businessId, "THIS_MONTH", processClock(now));

    expect(summary.revenue.toString()).toBe("0");
    expect(summary.netMargin).toBeNull();
    expect(summary.grossMargin).toBeNull();
  });

  it("período sem nenhum lançamento retorna resumo vazio, não um erro", async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId } });

    const summary = await getFinancialSummary(businessId, "THIS_MONTH", processClock());

    expect(summary.hasAnyEntries).toBe(false);
    expect(summary.revenue.toString()).toBe("0");
    expect(summary.netMargin).toBeNull();
  });

  afterAll(async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });
});
