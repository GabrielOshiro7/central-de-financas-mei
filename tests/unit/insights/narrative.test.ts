import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Prisma } from "@prisma/client";
import * as aiProvider from "@/lib/ai/provider";
import type { AIProvider } from "@/lib/ai/provider";
import { buildWhitelist, enrichWithAI } from "@/lib/insights/narrative";
import type { InsightDraft } from "@/lib/insights/rules";

const { Decimal } = Prisma;

function baseDraft(overrides: Partial<InsightDraft> = {}): InsightDraft {
  return {
    category: "PERFORMANCE",
    metric: "REVENUE_GROWTH",
    priority: "ATTENTION",
    title: "Faturamento em queda",
    description: "O faturamento de setembro de 2026 foi $880.00, uma variação de -12.0% em relação a $1,000.00 no período anterior.",
    recommendation: "Revise o que mudou nas vendas deste período antes de cortar custos.",
    currentValue: new Decimal(880),
    previousValue: new Decimal(1000),
    variationAbsolute: new Decimal(-120),
    variationPercent: new Decimal(-12),
    variationKind: "PERCENT",
    source: "financeiro",
    narrativeSource: "template",
    ...overrides,
  };
}

class FakeProvider implements AIProvider {
  constructor(private response: string | null | (() => Promise<string | null>)) {}
  async generateText(): Promise<string | null> {
    if (typeof this.response === "function") return this.response();
    return this.response;
  }
}

function mockProvider(provider: AIProvider) {
  vi.spyOn(aiProvider, "getAIProvider").mockReturnValue(provider);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildWhitelist", () => {
  it("normaliza números com convenção en-US (vírgula=milhar, ponto=decimal)", () => {
    const draft = baseDraft();
    const whitelist = buildWhitelist(draft);
    expect(whitelist.has("880.00")).toBe(true);
    expect(whitelist.has("1000.00")).toBe(true);
    expect(whitelist.has("-12.00")).toBe(true);
  });

  it("reconhece o mesmo número escrito em convenção pt-BR (ponto=milhar, vírgula=decimal) como equivalente", () => {
    const draft = baseDraft({ description: "O faturamento foi R$1.000,00 neste mês." });
    const whitelist = buildWhitelist(draft);
    expect(whitelist.has("1000.00")).toBe(true);
  });
});

describe("enrichWithAI - fallback para o template determinístico", () => {
  it("mantém o draft original quando o provedor é o NullProvider (retorna null)", async () => {
    mockProvider(new FakeProvider(null));
    const draft = baseDraft();
    const result = await enrichWithAI(draft);
    expect(result).toEqual(draft);
    expect(result.narrativeSource).toBe("template");
  });

  it("mantém o draft original quando o provedor lança uma exceção", async () => {
    mockProvider(
      new FakeProvider(() => {
        throw new Error("timeout simulado");
      })
    );
    const draft = baseDraft();
    const result = await enrichWithAI(draft);
    expect(result).toEqual(draft);
  });

  it("mantém o draft original quando a resposta não é um JSON válido", async () => {
    mockProvider(new FakeProvider("isso não é json"));
    const draft = baseDraft();
    const result = await enrichWithAI(draft);
    expect(result).toEqual(draft);
  });

  it("mantém o draft original quando a resposta contém um número fora da whitelist (número inventado)", async () => {
    mockProvider(
      new FakeProvider(
        JSON.stringify({
          description: "O faturamento caiu para $880.00, uma queda de -45.0% em relação ao período anterior.",
          recommendation: null,
        })
      )
    );
    const draft = baseDraft();
    const result = await enrichWithAI(draft);
    expect(result).toEqual(draft);
    expect(result.narrativeSource).toBe("template");
  });
});

describe("enrichWithAI - aceita a reescrita quando todos os números batem", () => {
  it("substitui description/recommendation e marca narrativeSource como 'ai'", async () => {
    mockProvider(
      new FakeProvider(
        JSON.stringify({
          description: "Em setembro de 2026, o faturamento somou $880.00, queda de -12.0% frente aos $1,000.00 anteriores.",
          recommendation: "Vale revisar o que mudou nas vendas.",
        })
      )
    );
    const draft = baseDraft();
    const result = await enrichWithAI(draft);
    expect(result.narrativeSource).toBe("ai");
    expect(result.description).toContain("880.00");
  });

  it("aceita quando a IA reformata um número para convenção pt-BR (mesmo valor)", async () => {
    mockProvider(
      new FakeProvider(
        JSON.stringify({
          description: "O faturamento foi de R$880,00, uma queda de -12,0% em relação a R$1.000,00.",
          recommendation: null,
        })
      )
    );
    const draft = baseDraft();
    const result = await enrichWithAI(draft);
    expect(result.narrativeSource).toBe("ai");
  });
});
