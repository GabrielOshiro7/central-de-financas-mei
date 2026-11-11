import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { getDashboardData } from "@/lib/finance/dashboardService";
import { getFinancialSummaryForRange } from "@/lib/finance/queries";
import { resolvePeriodRange, type PeriodKey } from "@/lib/finance/period";
import { dateKeyToDbDate, formatDateKey } from "@/lib/time/zoned";

// Visao Geral: o periodo ATUAL continua exatamente como antes (mesmos numeros) e as
// variacoes passam a ser calculadas contra o "periodo anterior equivalente" (mesmos
// dias do mes/ano anterior, etc.). Relogio fixo, empresa em Asia/Tokyo.
const TZ = "Asia/Tokyo";
const clock = { now: new Date("2026-03-10T03:00:00Z"), timeZone: TZ }; // 10/03/2026 12:00 JST
let userId: string;
let businessId: string;

// (dia, valor) - todas receitas.
const REVENUES: [string, number][] = [
  ["2024-06-01", 500],
  ["2025-03-05", 300], // dentro de "1/jan a 10/mar" do ano anterior
  ["2025-03-20", 700], // fora (depois de 10/03/2025)
  ["2025-11-10", 330],
  ["2026-01-15", 400],
  ["2026-02-05", 100], // dentro de "1/fev a 10/fev"
  ["2026-02-20", 900], // fora
  ["2026-03-03", 200],
  ["2026-03-25", 50], // futuro dentro do mes corrente
];

beforeAll(async () => {
  const user = await prisma.user.create({ data: { name: "Teste Comparacao", email: `cmp-${Date.now()}@example.com`, passwordHash: "x" } });
  userId = user.id;
  businessId = (await prisma.business.create({ data: { userId, name: "Empresa Comparacao", currency: "BRL", timezone: TZ } })).id;
  const category = await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } });
  await prisma.financialEntry.createMany({
    data: REVENUES.map(([day, amount]) => ({
      businessId,
      userId,
      type: "REVENUE" as const,
      categoryId: category.id,
      description: `Receita ${day}`,
      amount: String(amount),
      occurredOn: dateKeyToDbDate(day),
    })),
  });
});

afterAll(async () => {
  await prisma.insight.deleteMany({ where: { businessId } });
  await prisma.financialEntry.deleteMany({ where: { businessId } });
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

const dashboard = (period: PeriodKey, customRange?: { start: string; end: string }) =>
  getDashboardData(businessId, "BRL", "Periodo", { period, customRange }, clock);

describe("Visão Geral: o resumo é o da consulta direta do range", () => {
  it.each(["THIS_MONTH", "LAST_MONTH", "LAST_3_MONTHS", "THIS_YEAR", "LAST_YEAR"] as PeriodKey[])(
    "%s: mesmo resumo da consulta direta do range que a Visão Geral resolve",
    async (period) => {
      const data = await dashboard(period);
      const range = resolvePeriodRange(period, clock, undefined, { throughToday: true });
      const direct = await getFinancialSummaryForRange(businessId, range, TZ);
      expect(data.summary.revenue.toString()).toBe(direct.revenue.toString());
      expect([data.range.start, data.range.end]).toEqual([range.start, range.end]);
    }
  );
});

describe("Visão Geral: Este mês / Este ano vão até HOJE; lançamento futuro só entra ao chegar o dia", () => {
  const at = (iso: string) => ({ now: new Date(iso), timeZone: TZ });
  const run = (period: PeriodKey, c: { now: Date; timeZone: string }) =>
    getDashboardData(businessId, "BRL", "Periodo", { period }, c);

  it("Este mês: o lançamento de 25/03 não entra em 10/03 (200) nem em 24/03; entra em 25/03 (250)", async () => {
    expect((await run("THIS_MONTH", clock)).summary.revenue.toNumber()).toBe(200);
    expect((await run("THIS_MONTH", at("2026-03-24T03:00:00Z"))).summary.revenue.toNumber()).toBe(200);
    expect((await run("THIS_MONTH", at("2026-03-25T03:00:00Z"))).summary.revenue.toNumber()).toBe(250);
    expect((await run("THIS_MONTH", at("2026-03-31T03:00:00Z"))).summary.revenue.toNumber()).toBe(250);
  });

  it("Este ano: idem (1600 em 10/03; 1650 no dia 25/03)", async () => {
    expect((await run("THIS_YEAR", clock)).summary.revenue.toNumber()).toBe(1600);
    expect((await run("THIS_YEAR", at("2026-03-25T03:00:00Z"))).summary.revenue.toNumber()).toBe(1650);
  });

  it("o cabeçalho/intervalo vai até hoje e a série do período também (a barra do mês só soma até hoje)", async () => {
    const data = await run("THIS_MONTH", clock);
    expect(data.range.start).toEqual(new Date("2026-02-28T15:00:00.000Z")); // 01/03 00:00 JST
    expect(data.range.end).toEqual(new Date("2026-03-10T15:00:00.000Z")); // 11/03 00:00 JST (exclusivo)
    expect(data.revenueTrend.reduce((sum, p) => sum + p.value, 0)).toBe(200);
  });

  it("os dois lados têm o mesmo recorte: 01/03 a 10/03 x 01/02 a 10/02", async () => {
    const data = await run("THIS_MONTH", clock);
    const days = (r: { start: Date; end: Date }) => Math.round((r.end.getTime() - r.start.getTime()) / 86_400_000);
    expect(days(data.range)).toBe(10);
    expect(days(data.comparisonRange)).toBe(10);
  });

  it("a lista do Financeiro não é afetada: o lançamento futuro continua existindo", async () => {
    const future = await prisma.financialEntry.findFirst({ where: { businessId, occurredOn: dateKeyToDbDate("2026-03-25") } });
    expect(future?.amount.toString()).toBe("50");
  });
});

describe("Visão Geral: variações contra o intervalo de comparação novo", () => {
  it("Este mês (10/03): compara 01/03 a 10/03 (200) com 01/02 a 10/02 (100), não com fevereiro inteiro (1000)", async () => {
    const data = await dashboard("THIS_MONTH");
    expect(data.summary.revenue.toNumber()).toBe(200);
    expect(data.previousSummary?.revenue.toNumber()).toBe(100);
    expect(data.revenueGrowth?.toNumber()).toBeCloseTo(100); // (200 - 100) / 100
    expect(formatDateKey("2026-02-01") + " — " + formatDateKey("2026-02-10")).toBe("01/02/2026 — 10/02/2026");
    expect(data.comparisonRange).toEqual({
      start: new Date("2026-01-31T15:00:00.000Z"), // 01/02 00:00 JST
      end: new Date("2026-02-10T15:00:00.000Z"), // 11/02 00:00 JST (exclusivo)
    });
  });

  it("Mês passado (fevereiro): compara com janeiro completo", async () => {
    const data = await dashboard("LAST_MONTH");
    expect(data.summary.revenue.toNumber()).toBe(1000);
    expect(data.previousSummary?.revenue.toNumber()).toBe(400);
    expect(data.revenueGrowth?.toNumber()).toBeCloseTo(150);
  });

  it("Últimos 3 meses (jan-mar): compara com out-dez, completos", async () => {
    const data = await dashboard("LAST_3_MONTHS");
    expect(data.summary.revenue.toNumber()).toBe(1650);
    expect(data.previousSummary?.revenue.toNumber()).toBe(330);
    expect(data.revenueGrowth?.toNumber()).toBeCloseTo(400);
  });

  it("Este ano (10/03): 1/jan a 10/mar (1600) x 1/jan a 10/mar do ano anterior (300), não o ano todo (1330)", async () => {
    const data = await dashboard("THIS_YEAR");
    expect(data.summary.revenue.toNumber()).toBe(1600);
    expect(data.previousSummary?.revenue.toNumber()).toBe(300);
    expect(data.revenueGrowth?.toNumber()).toBeCloseTo(433.33, 1);
  });

  it("Ano passado: compara com o ano anterior a ele, completo", async () => {
    const data = await dashboard("LAST_YEAR");
    expect(data.summary.revenue.toNumber()).toBe(1330); // 300 + 700 + 330
    expect(data.previousSummary?.revenue.toNumber()).toBe(500);
    expect(data.revenueGrowth?.toNumber()).toBeCloseTo(166, 0);
  });

  it("Personalizado (01/03 a 10/03, 10 dias): compara com os 10 dias imediatamente anteriores (19/02 a 28/02)", async () => {
    const data = await dashboard("CUSTOM", { start: "2026-03-01", end: "2026-03-10" });
    expect(data.summary.revenue.toNumber()).toBe(200);
    expect(data.previousSummary?.revenue.toNumber()).toBe(900);
    expect(data.revenueGrowth?.toNumber()).toBeCloseTo(-77.78, 1);
  });

  it("a série de comparação acompanha o intervalo novo (Este mês: só fevereiro até o dia 10)", async () => {
    const data = await dashboard("THIS_MONTH");
    const total = (data.compareRevenueTrend ?? []).reduce((sum, p) => sum + p.value, 0);
    expect(total).toBe(100);
  });
});
