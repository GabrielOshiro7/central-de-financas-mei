import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { resolvePeriodRange } from "@/lib/finance/period";
import { getDailySeriesForRange, getFinancialSummary, getMonthlySeriesForRange } from "@/lib/finance/queries";
import { getDashboardData } from "@/lib/finance/dashboardService";
import { getInsightsForBusiness } from "@/lib/insights/queries";
import { computeIndicatorSnapshot } from "@/lib/insights/snapshot";
import { dbDateOfInstant } from "@/lib/time/zoned";

// Etapa F3a: dashboard, series e insights agrupam pelo FUSO DA EMPRESA,
// nunca pelo fuso do processo. Instantes sempre em UTC explicito e fuso
// sempre passado: mesmo resultado com o processo em UTC, Asia/Tokyo ou
// America/New_York.
describe("dashboard/séries/insights no fuso da empresa (Etapa F3a)", () => {
  let userId: string;
  let businessId: string;
  let revenueCategoryId: string;

  // 31/10 16:00Z = 01/11 01:00 em Tóquio = 31/10 13:00 em São Paulo = 31/10 em UTC.
  const NEAR_MONTH_TURN = new Date("2026-10-31T16:00:00Z");
  // 22/10 20:00Z = 23/10 05:00 em Tóquio (o caso 00:00–09:00 JST).
  const EARLY_JST = new Date("2026-10-22T20:00:00Z");

  beforeAll(async () => {
    revenueCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } })).id;
    const user = await prisma.user.create({
      data: {
        name: "Teste F3a",
        email: `f3a-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    userId = user.id;
    businessId = (await prisma.business.create({ data: { userId, name: "Empresa F3a", currency: "BRL" } })).id;
    await prisma.financialEntry.createMany({
      data: [
        { businessId, userId, type: "REVENUE", categoryId: revenueCategoryId, description: "Virada de mês", amount: "100", occurredAt: NEAR_MONTH_TURN , occurredOn: dbDateOfInstant(NEAR_MONTH_TURN, "Asia/Tokyo")},
        { businessId, userId, type: "REVENUE", categoryId: revenueCategoryId, description: "Madrugada JST", amount: "7", occurredAt: EARLY_JST , occurredOn: dbDateOfInstant(EARLY_JST, "Asia/Tokyo")},
      ],
    });
  });

  afterAll(async () => {
    await prisma.insight.deleteMany({ where: { businessId } });
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.business.deleteMany({ where: { id: businessId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("série mensal: o lançamento de 01/11 01:00 JST cai em novembro para Tóquio e em outubro para São Paulo/UTC", async () => {
    const range = { start: new Date("2026-09-15T00:00:00Z"), end: new Date("2026-11-15T00:00:00Z") };
    const tokyo = await getMonthlySeriesForRange(businessId, range, "Asia/Tokyo");
    expect(tokyo.find((p) => p.month === 10)?.revenue.toNumber()).toBe(100); // novembro
    expect(tokyo.find((p) => p.month === 9)?.revenue.toNumber()).toBe(7); // outubro (só a madrugada JST)

    for (const tz of ["America/Sao_Paulo", "UTC"]) {
      const series = await getMonthlySeriesForRange(businessId, range, tz);
      expect(series.find((p) => p.month === 9)?.revenue.toNumber()).toBe(107);
      expect(series.find((p) => p.month === 10)?.revenue.toNumber()).toBe(0);
    }
  });

  it("série diária: a madrugada JST (22/10 20:00Z) é 23/10 em Tóquio e 22/10 em UTC", async () => {
    const clock = { now: new Date("2026-10-24T03:00:00Z"), timeZone: "Asia/Tokyo" };
    const range = resolvePeriodRange("LAST_7_DAYS", clock); // 18/10..24/10 em Tóquio
    const tokyo = await getDailySeriesForRange(businessId, range, "Asia/Tokyo");
    expect(tokyo.map((p) => p.label)).toEqual(["18/10", "19/10", "20/10", "21/10", "22/10", "23/10", "24/10"]);
    expect(tokyo.find((p) => p.label === "23/10")?.revenue.toNumber()).toBe(7);
    expect(tokyo.find((p) => p.label === "22/10")?.revenue.toNumber()).toBe(0);

    const utcRange = resolvePeriodRange("LAST_7_DAYS", { now: clock.now, timeZone: "UTC" });
    const utc = await getDailySeriesForRange(businessId, utcRange, "UTC");
    expect(utc.find((p) => p.label === "22/10")?.revenue.toNumber()).toBe(7);
  });

  it("resumo e dashboard de 'este mês' às 01:00 JST de 01/11: Tóquio já está em novembro, UTC ainda em outubro", async () => {
    const tokyoClock = { now: NEAR_MONTH_TURN, timeZone: "Asia/Tokyo" };
    const utcClock = { now: NEAR_MONTH_TURN, timeZone: "UTC" };

    expect((await getFinancialSummary(businessId, "THIS_MONTH", tokyoClock)).revenue.toNumber()).toBe(100);
    expect((await getFinancialSummary(businessId, "THIS_MONTH", utcClock)).revenue.toNumber()).toBe(107);

    const filters = { period: "THIS_MONTH" as const, comparison: "PREVIOUS_PERIOD" as const };
    const tokyo = await getDashboardData(businessId, "BRL", "Este mês", filters, tokyoClock);
    expect(tokyo.range.start.toISOString()).toBe("2026-10-31T15:00:00.000Z");
    expect(tokyo.summary.revenue.toNumber()).toBe(100);
    expect(tokyo.previousSummary?.revenue.toNumber()).toBe(7); // outubro em Tóquio
    expect(tokyo.comparisonRange?.start.toISOString()).toBe("2026-09-30T15:00:00.000Z");

    const utc = await getDashboardData(businessId, "BRL", "Este mês", filters, utcClock);
    expect(utc.range.start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(utc.summary.revenue.toNumber()).toBe(107);
  });

  it("insights: o período do mês corrente (snapshot e leitura) segue o fuso da empresa", async () => {
    const tokyoClock = { now: NEAR_MONTH_TURN, timeZone: "Asia/Tokyo" };
    const tokyo = await computeIndicatorSnapshot(businessId, "BRL", tokyoClock);
    expect(tokyo.periodKey).toBe("2026-11");
    expect(tokyo.periodLabel).toBe("novembro de 2026");
    expect(tokyo.periodStart.toISOString()).toBe("2026-10-31T15:00:00.000Z");
    expect(tokyo.revenue).toEqual({ current: expect.anything(), previous: expect.anything() });
    expect(tokyo.revenue.current.toNumber()).toBe(100);

    const utc = await computeIndicatorSnapshot(businessId, "BRL", { now: NEAR_MONTH_TURN, timeZone: "UTC" });
    expect(utc.periodKey).toBe("2026-10");
    expect(utc.periodLabel).toBe("outubro de 2026");
    expect(utc.revenue.current.toNumber()).toBe(107);

    // O caminho de leitura usado pelo dashboard/página roda no mesmo fuso
    // (sem erro e sem misturar períodos de fusos diferentes).
    const read = await getInsightsForBusiness(businessId, tokyoClock);
    expect(read.every((i) => i.periodKey === "2026-11")).toBe(true);
  });
});
