import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { getFinancialSummary } from "@/lib/finance/queries";
import { processClock } from "../helpers/processClock";
import { dbDateOfInstant } from "@/lib/time/zoned";

describe("resumo financeiro (dados inseridos diretamente no banco de teste)", () => {
  let userId: string;
  let businessId: string;
  let revenueCategoryId: string;
  let costCategoryId: string;
  let expenseCategoryId: string;

  beforeAll(async () => {
    const [revenueCategory, costCategory, expenseCategory] = await Promise.all([
      prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } }),
      prisma.category.findFirstOrThrow({ where: { businessId: null, type: "EXPENSE", name: "Mercadoria" } }),
      prisma.category.findFirstOrThrow({ where: { businessId: null, type: "EXPENSE" } }),
    ]);
    revenueCategoryId = revenueCategory.id;
    costCategoryId = costCategory.id;
    expenseCategoryId = expenseCategory.id;
  });

  it("calcula lucro e margem líquida a partir de lançamentos reais (receita − despesas)", async () => {
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
          occurredOn: dbDateOfInstant(now, "Asia/Tokyo"),
        },
        {
          businessId,
          userId,
          type: "EXPENSE",
          categoryId: costCategoryId, // categoria "Mercadoria" (era custo; hoje despesa)
          description: "Mercadoria",
          amount: "400",
          occurredOn: dbDateOfInstant(now, "Asia/Tokyo"),
        },
        {
          businessId,
          userId,
          type: "EXPENSE",
          categoryId: expenseCategoryId,
          description: "Aluguel",
          amount: "100",
          occurredOn: dbDateOfInstant(now, "Asia/Tokyo"),
        },
      ],
    });

    const summary = await getFinancialSummary(businessId, "THIS_MONTH", processClock(now));

    expect(summary.revenue.toString()).toBe("1000");
    expect(summary.expenses.toString()).toBe("500"); // 400 (ex-custo) + 100
    expect(summary.netProfit.toString()).toBe("500");
    expect(summary.netMargin?.toNumber()).toBe(50);
  });

  it("faturamento zero no período retorna margem null (N/A), sem erro de divisão por zero", async () => {
    const now = new Date();
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.financialEntry.create({
      data: {
        businessId,
        userId,
        type: "EXPENSE",
        categoryId: costCategoryId,
        description: "Mercadoria",
        amount: "200",
        occurredOn: dbDateOfInstant(now, "Asia/Tokyo"),
      },
    });

    const summary = await getFinancialSummary(businessId, "THIS_MONTH", processClock(now));

    expect(summary.revenue.toString()).toBe("0");
    expect(summary.netMargin).toBeNull();
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
