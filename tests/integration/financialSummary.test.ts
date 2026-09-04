import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { getFinancialSummary } from "@/lib/finance/queries";

describe("resumo financeiro (dados inseridos diretamente no banco de teste)", () => {
  let userId: string;
  let businessId: string;

  it("calcula lucro e margem a partir de lançamentos reais", async () => {
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
        { businessId, type: "REVENUE", amount: "1000", occurredAt: now },
        { businessId, type: "COST", amount: "400", occurredAt: now },
        { businessId, type: "EXPENSE", amount: "100", occurredAt: now },
      ],
    });

    const summary = await getFinancialSummary(businessId, "THIS_MONTH", now);

    expect(summary.revenue.toString()).toBe("1000");
    expect(summary.costs.toString()).toBe("400");
    expect(summary.expenses.toString()).toBe("100");
    expect(summary.netProfit.toString()).toBe("500");
    expect(summary.netMargin?.toNumber()).toBe(50);
  });

  it("faturamento zero no período retorna margem null (N/A), sem erro de divisão por zero", async () => {
    const now = new Date();
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.financialEntry.create({
      data: { businessId, type: "COST", amount: "200", occurredAt: now },
    });

    const summary = await getFinancialSummary(businessId, "THIS_MONTH", now);

    expect(summary.revenue.toString()).toBe("0");
    expect(summary.netMargin).toBeNull();
  });

  it("período sem nenhum lançamento retorna resumo vazio, não um erro", async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId } });

    const summary = await getFinancialSummary(businessId, "THIS_MONTH");

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
