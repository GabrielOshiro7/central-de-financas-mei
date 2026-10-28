import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { getFinancialSummaryForRange } from "@/lib/finance/queries";
import { clipToSameDayOfMonth, resolveInsightPeriods, computeIndicatorSnapshot } from "@/lib/insights/snapshot";
import { PROCESS_TZ, processClock } from "../../helpers/processClock";
import { dbDateOfInstant } from "@/lib/time/zoned";

describe("clipToSameDayOfMonth", () => {
  it("corta no mesmo dia quando ele existe no mês anterior", () => {
    // Mês anterior de 31 dias (janeiro/2026), dia de referência = 15.
    const range = { start: new Date(2026, 0, 1), end: new Date(2026, 1, 1) };
    const clipped = clipToSameDayOfMonth(range, 15, PROCESS_TZ);
    expect(clipped.start).toEqual(new Date(2026, 0, 1));
    // end exclusivo: dia 16 às 00:00 (inclui o dia 15 inteiro).
    expect(clipped.end).toEqual(new Date(2026, 0, 16));
  });

  it("clampa para o último dia de fevereiro comum (28 dias) quando o dia de referência é 30", () => {
    const range = { start: new Date(2026, 1, 1), end: new Date(2026, 2, 1) }; // fevereiro/2026 (comum, 28 dias)
    const clipped = clipToSameDayOfMonth(range, 30, PROCESS_TZ);
    expect(clipped.start).toEqual(new Date(2026, 1, 1));
    // Com o clamp (dia 28, o último real): o fim exclusivo é 1º de março -
    // fevereiro inteiro, igual a qualquer range mensal não recortado (mesma
    // convenção de period.ts). SEM o clamp, `new Date(2026, 1, 30 + 1)`
    // rolaria para 3 de março (2 dias reais de vazamento) - é exatamente
    // esse vazamento que o clamp existe para prevenir.
    expect(clipped.end).toEqual(new Date(2026, 2, 1));
  });

  it("clampa para o último dia de fevereiro bissexto (29 dias) quando o dia de referência é 31", () => {
    const range = { start: new Date(2028, 1, 1), end: new Date(2028, 2, 1) }; // fevereiro/2028 (bissexto, 29 dias)
    const clipped = clipToSameDayOfMonth(range, 31, PROCESS_TZ);
    // Mesmo raciocínio: com o clamp (dia 29), o fim exclusivo cai em 1º de
    // março - nunca em 2 ou 3 de março, que é o que um `new Date` sem clamp
    // sobre o dia 31 bruto produziria.
    expect(clipped.end).toEqual(new Date(2028, 2, 1));
  });

  it("não precisa clampar quando o dia de referência existe no mês anterior (31 vs. 31 dias)", () => {
    const range = { start: new Date(2026, 0, 1), end: new Date(2026, 1, 1) }; // janeiro/2026 (31 dias)
    const clipped = clipToSameDayOfMonth(range, 31, PROCESS_TZ);
    expect(clipped.end).toEqual(new Date(2026, 1, 1));
  });
});

describe("resolveInsightPeriods", () => {
  it("marca isPartial=true quando ainda há dias restantes no mês atual", () => {
    const now = new Date(2026, 8, 15); // 15/09/2026
    const { current, isPartial } = resolveInsightPeriods(processClock(now));
    expect(current.start).toEqual(new Date(2026, 8, 1));
    expect(current.end).toEqual(new Date(2026, 9, 1));
    expect(isPartial).toBe(true);
  });

  it("recorta o período anterior até o mesmo dia-do-mês de 'now'", () => {
    const now = new Date(2026, 8, 15); // 15/09/2026
    const { previousClipped } = resolveInsightPeriods(processClock(now));
    expect(previousClipped.start).toEqual(new Date(2026, 7, 1));
    expect(previousClipped.end).toEqual(new Date(2026, 7, 16)); // até 15/08 inclusive
  });

  it("clampa o recorte do período anterior quando o mês atual tem mais dias que fevereiro", () => {
    const now = new Date(2026, 2, 31); // 31/03/2026 - mês anterior é fevereiro (28 dias)
    const { previousClipped } = resolveInsightPeriods(processClock(now));
    expect(previousClipped.start).toEqual(new Date(2026, 1, 1));
    expect(previousClipped.end).toEqual(new Date(2026, 2, 1)); // fevereiro inteiro, nunca vaza pra março
  });
});

// Este describe usa o Postgres real (via prisma) - diferente do resto do
// arquivo, que é puro. Colocado aqui (e não em tests/integration/) porque o
// que está sendo travado é uma regra de composição de computeIndicatorSnapshot
// em si (hasPreviousPeriod desacoplado do range recortado), não um fluxo de
// integração ponta-a-ponta - ver correção explícita durante o planejamento
// da Etapa 7.
describe("computeIndicatorSnapshot - hasPreviousPeriod desacoplado do recorte", () => {
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
        name: "Teste Snapshot Cold Start",
        email: `snapshot-cold-start-${Date.now()}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    userId = user.id;

    const business = await prisma.business.create({
      data: { userId, name: "Empresa Snapshot Cold Start", currency: "BRL" },
    });
    businessId = business.id;
  });

  afterAll(async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  it("não classifica como início frio uma empresa cujo histórico está concentrado na segunda quinzena do mês anterior", async () => {
    // Hoje = dia 3 de setembro/2026. Todo o histórico da empresa está entre
    // os dias 20 e 28 de agosto - o recorte "dia 1 ao dia 3" de agosto
    // (previousClipped, já que now.getDate() === 3) fica vazio por pura
    // coincidência de timing, não por falta de dado.
    const now = new Date(2026, 8, 3);
    await prisma.financialEntry.create({
      data: {
        businessId,
        userId,
        type: "REVENUE",
        categoryId: revenueCategoryId,
        description: "Recebimento concentrado no fim de agosto",
        amount: "5000",
        occurredAt: new Date(2026, 7, 25), occurredOn: dbDateOfInstant(new Date(2026, 7, 25), "Asia/Tokyo"),
      },
    });

    // Confirma a premissa do cenário: o range recortado realmente não pega
    // nenhum lançamento.
    const previousClippedRange = { start: new Date(2026, 7, 1), end: new Date(2026, 7, 4) };
    const clippedSummary = await getFinancialSummaryForRange(businessId, previousClippedRange, "Asia/Tokyo");
    expect(clippedSummary.hasAnyEntries).toBe(false);

    const snapshot = await computeIndicatorSnapshot(businessId, "BRL", processClock(now));
    expect(snapshot.hasPreviousPeriod).toBe(true);
  });
});
