import { describe, it, expect, vi, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createBill, settleBill } from "@/lib/finance/bills/mutations";
import { createSale, cancelSale } from "@/lib/sales/mutations";
import { getFinancialSummaryForRange } from "@/lib/finance/queries";
import { getInsightsForBusiness } from "@/lib/insights/queries";
import { generateInsightsForBusiness } from "@/lib/insights/mutations";
import * as aiProvider from "@/lib/ai/provider";
import type { AIProvider } from "@/lib/ai/provider";

// Provedor falso so para este arquivo: ecoa de volta EXATAMENTE os mesmos
// numeros/texto que já estavam no draft (extraídos do próprio prompt), então
// sempre passa na checagem de whitelist - usado para exercitar o caminho
// "withAI: true" (regenerar) de ponta a ponta sem depender de nenhuma chave
// de API real.
class EchoProvider implements AIProvider {
  async generateText(prompt: string): Promise<string | null> {
    const descMatch = prompt.match(/Descrição atual: (.*)/);
    const recMatch = prompt.match(/Recomendação atual: (.*)/);
    const description = descMatch?.[1] ?? "";
    const recommendationRaw = recMatch?.[1] ?? "(nenhuma)";
    const recommendation = recommendationRaw === "(nenhuma)" ? null : recommendationRaw;
    return JSON.stringify({ description, recommendation });
  }
}

async function setupBusiness(name: string) {
  const revenueCategory = await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } });
  const user = await prisma.user.create({
    data: { name, email: `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}@example.com`, passwordHash: await hashPassword("SenhaValida123") },
  });
  const business = await prisma.business.create({ data: { userId: user.id, name, currency: "BRL" } });
  const client = await prisma.client.create({
    data: { businessId: business.id, name: `Cliente ${name}`, clientType: "PESSOA_FISICA" },
  });
  return { userId: user.id, businessId: business.id, revenueCategoryId: revenueCategory.id, clientId: client.id };
}

async function cleanupBusiness(businessId: string, userId: string) {
  await prisma.insight.deleteMany({ where: { businessId } });
  await prisma.financialEntry.deleteMany({ where: { businessId } });
  await prisma.bill.deleteMany({ where: { businessId } });
  await prisma.saleItem.deleteMany({ where: { sale: { businessId } } });
  await prisma.sale.deleteMany({ where: { businessId } });
  await prisma.client.deleteMany({ where: { businessId } });
  await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}

describe("Insights (Etapa 7) - integração", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("checagem cruzada: currentValue de REVENUE_GROWTH bate com getFinancialSummaryForRange calculado independentemente", async () => {
    const { userId, businessId, revenueCategoryId } = await setupBusiness("Insights CrossCheck");
    try {
      const now = new Date(2026, 8, 15); // 15/09/2026
      await prisma.financialEntry.createMany({
        data: [
          { businessId, userId, type: "REVENUE", categoryId: revenueCategoryId, description: "Ago", amount: "1000", occurredAt: new Date(2026, 7, 10) },
          { businessId, userId, type: "REVENUE", categoryId: revenueCategoryId, description: "Set 1", amount: "700", occurredAt: new Date(2026, 8, 5) },
          { businessId, userId, type: "REVENUE", categoryId: revenueCategoryId, description: "Set 2", amount: "500", occurredAt: new Date(2026, 8, 12) },
        ],
      });

      const insights = await getInsightsForBusiness(businessId, now);
      const revenueInsight = insights.find((i) => i.metric === "REVENUE_GROWTH");
      expect(revenueInsight).toBeDefined();

      const independentSummary = await getFinancialSummaryForRange(businessId, {
        start: new Date(2026, 8, 1),
        end: new Date(2026, 9, 1),
      });
      expect(revenueInsight!.currentValue?.toString()).toBe(independentSummary.revenue.toString());
    } finally {
      await cleanupBusiness(businessId, userId);
    }
  });

  it("desatualização: um novo recebimento no mês corrente invalida o cache e o próximo GET reflete o valor atualizado", async () => {
    const { userId, businessId, revenueCategoryId } = await setupBusiness("Insights Staleness");
    try {
      const now = new Date(2026, 8, 15);
      await prisma.financialEntry.createMany({
        data: [
          { businessId, userId, type: "REVENUE", categoryId: revenueCategoryId, description: "Ago", amount: "1000", occurredAt: new Date(2026, 7, 10) },
          { businessId, userId, type: "REVENUE", categoryId: revenueCategoryId, description: "Set 1", amount: "1400", occurredAt: new Date(2026, 8, 5) },
        ],
      });

      const first = await getInsightsForBusiness(businessId, now);
      const firstRevenue = first.find((i) => i.metric === "REVENUE_GROWTH");
      expect(firstRevenue?.currentValue?.toString()).toBe("1400");
      expect(firstRevenue?.narrativeSource).toBe("template");

      // Novo recebimento dentro do mesmo mês, via o pipeline real (createBill
      // + settleBill), como o resto do sistema faria.
      const billResult = await createBill(businessId, "RECEIVABLE", {
        categoryId: revenueCategoryId,
        description: "Recebimento adicional",
        amount: 500,
        dueDate: new Date(2026, 8, 14),
      });
      expect(billResult.ok).toBe(true);
      if (!billResult.ok) return;
      await settleBill(businessId, userId, billResult.value.id, new Date(2026, 8, 14));

      const second = await getInsightsForBusiness(businessId, now);
      const secondRevenue = second.find((i) => i.metric === "REVENUE_GROWTH");
      expect(secondRevenue?.currentValue?.toString()).toBe("1900");
      // Caminho de leitura nunca chama IA, mesmo ao regenerar por
      // desatualização.
      expect(secondRevenue?.narrativeSource).toBe("template");
    } finally {
      await cleanupBusiness(businessId, userId);
    }
  });

  it("regenerar (withAI: true) não quebra a detecção de desatualização - dado novo sempre volta para template no próximo GET", async () => {
    const { userId, businessId, revenueCategoryId } = await setupBusiness("Insights Regenerate");
    try {
      const now = new Date(2026, 8, 15);
      await prisma.financialEntry.createMany({
        data: [
          { businessId, userId, type: "REVENUE", categoryId: revenueCategoryId, description: "Ago", amount: "1000", occurredAt: new Date(2026, 7, 10) },
          { businessId, userId, type: "REVENUE", categoryId: revenueCategoryId, description: "Set 1", amount: "1300", occurredAt: new Date(2026, 8, 5) },
        ],
      });

      vi.spyOn(aiProvider, "getAIProvider").mockReturnValue(new EchoProvider());
      await generateInsightsForBusiness(businessId, now, { withAI: true });

      const afterRegenerate = await prisma.insight.findFirst({ where: { businessId, metric: "REVENUE_GROWTH" } });
      expect(afterRegenerate?.narrativeSource).toBe("ai");

      // Dado muda depois da regeneração com IA.
      await prisma.financialEntry.create({
        data: { businessId, userId, type: "REVENUE", categoryId: revenueCategoryId, description: "Set 2", amount: "700", occurredAt: new Date(2026, 8, 20) },
      });

      const afterChange = await getInsightsForBusiness(businessId, now);
      const revenueInsight = afterChange.find((i) => i.metric === "REVENUE_GROWTH");
      expect(revenueInsight?.currentValue?.toString()).toBe("2000");
      // Nunca deve mostrar uma narrativa de IA associada a números que já
      // mudaram - o GET sempre volta para o template ao regenerar.
      expect(revenueInsight?.narrativeSource).toBe("template");
    } finally {
      await cleanupBusiness(businessId, userId);
    }
  });

  it("início frio: empresa só com dados do mês atual não gera nenhuma métrica comparativa, sem lançar exceção", async () => {
    const { userId, businessId, revenueCategoryId } = await setupBusiness("Insights ColdStart");
    try {
      const now = new Date(2026, 8, 15);
      await prisma.financialEntry.create({
        data: { businessId, userId, type: "REVENUE", categoryId: revenueCategoryId, description: "Primeira venda", amount: "500", occurredAt: new Date(2026, 8, 10) },
      });

      const insights = await getInsightsForBusiness(businessId, now);
      expect(insights).toEqual([]);
    } finally {
      await cleanupBusiness(businessId, userId);
    }
  });

  it("multiempresa: duas empresas com receita idêntica geram linhas de Insight totalmente independentes", async () => {
    const a = await setupBusiness("Insights MultiA");
    const b = await setupBusiness("Insights MultiB");
    try {
      const now = new Date(2026, 8, 15);
      for (const { businessId, userId, revenueCategoryId } of [a, b]) {
        await prisma.financialEntry.createMany({
          data: [
            { businessId, userId, type: "REVENUE", categoryId: revenueCategoryId, description: "Ago", amount: "1000", occurredAt: new Date(2026, 7, 10) },
            { businessId, userId, type: "REVENUE", categoryId: revenueCategoryId, description: "Set", amount: "2000", occurredAt: new Date(2026, 8, 5) },
          ],
        });
      }

      const [insightsA, insightsB] = await Promise.all([
        getInsightsForBusiness(a.businessId, now),
        getInsightsForBusiness(b.businessId, now),
      ]);

      expect(insightsA.every((i) => i.businessId === a.businessId)).toBe(true);
      expect(insightsB.every((i) => i.businessId === b.businessId)).toBe(true);

      const countA = await prisma.insight.count({ where: { businessId: a.businessId } });
      const countB = await prisma.insight.count({ where: { businessId: b.businessId } });
      expect(countA).toBeGreaterThan(0);
      expect(countB).toBe(countA);
    } finally {
      await cleanupBusiness(a.businessId, a.userId);
      await cleanupBusiness(b.businessId, b.userId);
    }
  });

  it("venda cancelada nunca contribui para o currentValue de REVENUE_GROWTH", async () => {
    const { userId, businessId, revenueCategoryId, clientId } = await setupBusiness("Insights CancelledSale");
    try {
      const now = new Date(2026, 8, 15);
      await prisma.financialEntry.create({
        data: { businessId, userId, type: "REVENUE", categoryId: revenueCategoryId, description: "Ago", amount: "1000", occurredAt: new Date(2026, 7, 10) },
      });

      const saleResult = await createSale(businessId, userId, {
        clientRequestId: `cancel-test-${Date.now()}`,
        status: "CONFIRMED",
        clientId,
        categoryId: revenueCategoryId,
        saleDate: new Date(2026, 8, 5),
        items: [{ quantity: 1, unitPrice: 900, description: "Item de teste" }],
        discount: null,
        installments: [{ dueDate: new Date(2026, 8, 20), amount: 900 }],
      });
      expect(saleResult.ok).toBe(true);
      if (!saleResult.ok) return;

      const cancelResult = await cancelSale(businessId, saleResult.value.id);
      expect(cancelResult.ok).toBe(true);

      const insights = await getInsightsForBusiness(businessId, now);
      const revenueInsight = insights.find((i) => i.metric === "REVENUE_GROWTH");
      // Nenhum FinancialEntry foi criado pela venda cancelada (nunca chegou a
      // ser paga) - currentValue de setembro é 0, nunca os 900 da venda
      // cancelada (o insight ainda dispara, corretamente, mostrando a queda
      // real de 1000 para 0 causada pela ausência total de receita em
      // setembro - o que importa aqui é que o valor NÃO inclui os 900).
      expect(revenueInsight?.currentValue?.toString()).toBe("0");

      const summary = await getFinancialSummaryForRange(businessId, { start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) });
      expect(summary.revenue.toString()).toBe("0");
    } finally {
      await cleanupBusiness(businessId, userId);
    }
  });
});
