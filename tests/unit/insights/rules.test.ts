import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { evaluateSnapshot } from "@/lib/insights/rules";
import type { IndicatorSnapshot } from "@/lib/insights/snapshot";

const { Decimal } = Prisma;

function baseSnapshot(overrides: Partial<IndicatorSnapshot> = {}): IndicatorSnapshot {
  return {
    currency: "BRL",
    periodKey: "2026-09",
    periodLabel: "setembro de 2026",
    periodStart: new Date(2026, 8, 1),
    periodEnd: new Date(2026, 9, 1),
    comparisonPeriodStart: new Date(2026, 7, 1),
    comparisonPeriodEnd: new Date(2026, 7, 31),
    isPartial: false,
    hasPreviousPeriod: true,
    revenue: { current: new Decimal(1000), previous: new Decimal(1000) },
    margin: { current: new Decimal(20), previous: new Decimal(20) },
    expenses: { current: new Decimal(500), previous: new Decimal(500) },
    ticketAverage: { current: new Decimal(100), previous: new Decimal(100) },
    receivablesOverdue: { current: new Decimal(0), previous: new Decimal(0) },
    clientConcentration: { topClientName: null, topClientShare: null, sampleSize: 0 },
    clientInactivity: { churnedClients: [] },
    ...overrides,
  };
}

function metricsOf(snapshot: IndicatorSnapshot) {
  return evaluateSnapshot(snapshot).map((d) => d.metric);
}

function draftFor(snapshot: IndicatorSnapshot, metric: string) {
  return evaluateSnapshot(snapshot).find((d) => d.metric === metric) ?? null;
}

describe("evaluateSnapshot - início frio", () => {
  it("nenhuma métrica comparativa dispara quando hasPreviousPeriod é false", () => {
    const snapshot = baseSnapshot({
      hasPreviousPeriod: false,
      revenue: { current: new Decimal(5000), previous: new Decimal(0) },
    });
    const metrics = metricsOf(snapshot);
    expect(metrics).not.toContain("REVENUE_GROWTH");
    expect(metrics).not.toContain("MARGIN_CHANGE");
    expect(metrics).not.toContain("EXPENSE_GROWTH");
    expect(metrics).not.toContain("TICKET_AVERAGE_CHANGE");
    expect(metrics).not.toContain("RECEIVABLES_OVERDUE_CHANGE");
    expect(metrics).not.toContain("CLIENT_INACTIVITY");
  });
});

describe("evaluateRevenueGrowth", () => {
  it("dispara com prioridade INFO quando a receita cresce acima do limiar", () => {
    const snapshot = baseSnapshot({ revenue: { current: new Decimal(1200), previous: new Decimal(1000) } }); // +20%
    const draft = draftFor(snapshot, "REVENUE_GROWTH");
    expect(draft).not.toBeNull();
    expect(draft!.priority).toBe("INFO");
    expect(draft!.variationKind).toBe("PERCENT");
  });

  it("dispara com prioridade ATTENTION quando a receita cai moderadamente", () => {
    const snapshot = baseSnapshot({ revenue: { current: new Decimal(880), previous: new Decimal(1000) } }); // -12%
    const draft = draftFor(snapshot, "REVENUE_GROWTH");
    expect(draft).not.toBeNull();
    expect(draft!.priority).toBe("ATTENTION");
  });

  it("dispara com prioridade CRITICAL quando a receita cai drasticamente (>= 2x o limiar)", () => {
    const snapshot = baseSnapshot({ revenue: { current: new Decimal(700), previous: new Decimal(1000) } }); // -30%
    const draft = draftFor(snapshot, "REVENUE_GROWTH");
    expect(draft).not.toBeNull();
    expect(draft!.priority).toBe("CRITICAL");
  });

  it("fica silencioso quando a variação está abaixo do limiar de relevância", () => {
    const snapshot = baseSnapshot({ revenue: { current: new Decimal(1050), previous: new Decimal(1000) } }); // +5%
    expect(draftFor(snapshot, "REVENUE_GROWTH")).toBeNull();
  });

  it("fica silencioso (em vez de lançar) quando a base anterior é perto de zero e a variação seria ilegível", () => {
    const snapshot = baseSnapshot({ revenue: { current: new Decimal(1000), previous: new Decimal(0.01) } });
    expect(() => evaluateSnapshot(snapshot)).not.toThrow();
    expect(draftFor(snapshot, "REVENUE_GROWTH")).toBeNull();
  });
});

describe("evaluateMarginChange", () => {
  it("dispara quando a margem cai acima do limiar de pontos percentuais", () => {
    const snapshot = baseSnapshot({ margin: { current: new Decimal(16), previous: new Decimal(20) } }); // -4pp
    const draft = draftFor(snapshot, "MARGIN_CHANGE");
    expect(draft).not.toBeNull();
    expect(draft!.variationKind).toBe("POINTS");
    expect(draft!.priority).toBe("ATTENTION");
  });

  it("fica silencioso quando a variação de margem está abaixo do limiar", () => {
    const snapshot = baseSnapshot({ margin: { current: new Decimal(19), previous: new Decimal(20) } }); // -1pp
    expect(draftFor(snapshot, "MARGIN_CHANGE")).toBeNull();
  });

  it("fica silencioso quando alguma das margens é null (receita zero em algum dos períodos)", () => {
    const snapshot = baseSnapshot({ margin: { current: null, previous: new Decimal(20) } });
    expect(draftFor(snapshot, "MARGIN_CHANGE")).toBeNull();
  });
});

describe("evaluateExpenseGrowth", () => {
  it("prioridade ATTENTION quando despesas crescem (direção ruim)", () => {
    const snapshot = baseSnapshot({ expenses: { current: new Decimal(575), previous: new Decimal(500) } }); // +15%
    const draft = draftFor(snapshot, "EXPENSE_GROWTH");
    expect(draft).not.toBeNull();
    expect(draft!.priority).toBe("ATTENTION");
  });

  it("prioridade INFO quando despesas caem (direção boa)", () => {
    const snapshot = baseSnapshot({ expenses: { current: new Decimal(400), previous: new Decimal(500) } }); // -20%
    const draft = draftFor(snapshot, "EXPENSE_GROWTH");
    expect(draft).not.toBeNull();
    expect(draft!.priority).toBe("INFO");
  });
});

describe("evaluateTicketAverageChange", () => {
  it("fica silencioso quando não há vendas em algum dos períodos (ticket médio null)", () => {
    const snapshot = baseSnapshot({ ticketAverage: { current: null, previous: new Decimal(100) } });
    expect(draftFor(snapshot, "TICKET_AVERAGE_CHANGE")).toBeNull();
  });

  it("dispara quando o ticket médio varia acima do limiar", () => {
    const snapshot = baseSnapshot({ ticketAverage: { current: new Decimal(130), previous: new Decimal(100) } });
    expect(draftFor(snapshot, "TICKET_AVERAGE_CHANGE")).not.toBeNull();
  });
});

describe("evaluateReceivablesOverdue", () => {
  it("dispara com direção ruim (piorou) quando o vencido aumenta", () => {
    const snapshot = baseSnapshot({ receivablesOverdue: { current: new Decimal(120), previous: new Decimal(100) } }); // +20%
    const draft = draftFor(snapshot, "RECEIVABLES_OVERDUE_CHANGE");
    expect(draft).not.toBeNull();
    expect(draft!.priority).toBe("ATTENTION");
    // A descrição precisa deixar explícito que é o vencido REFERENTE AO MÊS,
    // nunca o total genérico de contas a receber (correção mandatória da
    // Etapa 7 - ver evaluateReceivablesOverdue em rules.ts).
    expect(draft!.description).toMatch(/com vencimento em/i);
  });

  it("fica silencioso quando não há bill vencida em nenhum dos períodos", () => {
    const snapshot = baseSnapshot({ receivablesOverdue: { current: new Decimal(0), previous: new Decimal(0) } });
    expect(draftFor(snapshot, "RECEIVABLES_OVERDUE_CHANGE")).toBeNull();
  });
});

describe("evaluateClientConcentration", () => {
  it("fica silencioso abaixo do tamanho mínimo de amostra", () => {
    const snapshot = baseSnapshot({
      clientConcentration: { topClientName: "Cliente X", topClientShare: new Decimal(80), sampleSize: 2 },
    });
    expect(draftFor(snapshot, "CLIENT_CONCENTRATION")).toBeNull();
  });

  it("fica silencioso quando o share do maior cliente está abaixo do limiar", () => {
    const snapshot = baseSnapshot({
      clientConcentration: { topClientName: "Cliente X", topClientShare: new Decimal(30), sampleSize: 10 },
    });
    expect(draftFor(snapshot, "CLIENT_CONCENTRATION")).toBeNull();
  });

  it("dispara ATTENTION quando o share está acima do limiar mas abaixo do dobro", () => {
    const snapshot = baseSnapshot({
      clientConcentration: { topClientName: "Cliente X", topClientShare: new Decimal(50), sampleSize: 10 },
    });
    const draft = draftFor(snapshot, "CLIENT_CONCENTRATION");
    expect(draft).not.toBeNull();
    expect(draft!.priority).toBe("ATTENTION");
  });

  it("dispara CRITICAL quando o share está acima do dobro do limiar", () => {
    const snapshot = baseSnapshot({
      clientConcentration: { topClientName: "Cliente X", topClientShare: new Decimal(85), sampleSize: 10 },
    });
    const draft = draftFor(snapshot, "CLIENT_CONCENTRATION");
    expect(draft).not.toBeNull();
    expect(draft!.priority).toBe("CRITICAL");
  });
});

describe("evaluateClientInactivity", () => {
  it("fica silencioso abaixo do tamanho mínimo de amostra", () => {
    const snapshot = baseSnapshot({
      clientConcentration: { topClientName: null, topClientShare: null, sampleSize: 2 },
      clientInactivity: { churnedClients: [{ clientId: "c1", name: "Cliente Sumido", previousShare: new Decimal(50) }] },
    });
    expect(draftFor(snapshot, "CLIENT_INACTIVITY")).toBeNull();
  });

  it("fica silencioso quando nenhum cliente sumido tinha share relevante", () => {
    const snapshot = baseSnapshot({
      clientConcentration: { topClientName: null, topClientShare: null, sampleSize: 10 },
      clientInactivity: { churnedClients: [{ clientId: "c1", name: "Cliente Pequeno", previousShare: new Decimal(2) }] },
    });
    expect(draftFor(snapshot, "CLIENT_INACTIVITY")).toBeNull();
  });

  it("dispara quando um cliente relevante do período anterior some no período atual", () => {
    const snapshot = baseSnapshot({
      clientConcentration: { topClientName: null, topClientShare: null, sampleSize: 10 },
      clientInactivity: { churnedClients: [{ clientId: "c1", name: "Cliente Grande", previousShare: new Decimal(25) }] },
    });
    const draft = draftFor(snapshot, "CLIENT_INACTIVITY");
    expect(draft).not.toBeNull();
    expect(draft!.description).toContain("Cliente Grande");
  });
});
