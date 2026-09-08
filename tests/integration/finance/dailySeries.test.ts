import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { resolvePeriodRange } from "@/lib/finance/period";
import { getDailySeriesForRange, getFinancialSummaryForRange } from "@/lib/finance/queries";

describe("getDailySeriesForRange - granularidade diária para períodos por dia (Etapa 4)", () => {
  let userId: string;
  let businessId: string;
  let revenueCategoryId: string;

  beforeAll(async () => {
    const revenueCategory = await prisma.category.findFirstOrThrow({
      where: { businessId: null, type: "REVENUE" },
    });
    revenueCategoryId = revenueCategory.id;

    const user = await prisma.user.create({
      data: {
        name: "Teste Série Diária",
        email: `daily-series-${Date.now()}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    userId = user.id;

    const business = await prisma.business.create({
      data: { userId: user.id, name: "Empresa Teste Diária", currency: "BRL" },
    });
    businessId = business.id;
  });

  it("LAST_7_DAYS retorna 7 pontos (um por dia) cuja soma bate com o resumo do mesmo período", async () => {
    const now = new Date();
    const range = resolvePeriodRange("LAST_7_DAYS", now);
    expect(range.alignment).toBe("day");

    // Um lançamento de receita por dia dentro do range, com valores distintos
    // (10, 20, ..., 70) para não correr risco de um bug de agrupamento "por
    // sorte" bater com o total.
    const entries = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(range.start);
      day.setDate(day.getDate() + i);
      day.setHours(12, 0, 0, 0); // meio-dia, longe de qualquer fronteira de meia-noite
      return {
        businessId,
        userId,
        type: "REVENUE" as const,
        categoryId: revenueCategoryId,
        description: `Venda dia ${i + 1}`,
        amount: String((i + 1) * 10),
        occurredAt: day,
      };
    });
    await prisma.financialEntry.createMany({ data: entries });

    const series = await getDailySeriesForRange(businessId, range);
    expect(series).toHaveLength(7);

    const seriesTotal = series.reduce((total, point) => total + point.revenue.toNumber(), 0);
    expect(seriesTotal).toBe(280); // 10+20+...+70

    // Consistência cruzada (ADENDO da Etapa 4): a soma da série diária tem
    // que bater exatamente com o valor que os cards do topo mostram para o
    // mesmo período, via getFinancialSummaryForRange.
    const summary = await getFinancialSummaryForRange(businessId, range);
    expect(seriesTotal).toBe(summary.revenue.toNumber());
  });

  afterAll(async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });
});
