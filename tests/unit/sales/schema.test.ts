import { describe, it, expect } from "vitest";
import { saleSchema, confirmSaleSchema } from "@/lib/sales/schema";

// Mesma regra que appointmentCompleteSchema (tests/unit/agenda/schema.test.ts):
// paidNow (venda à vista) só vale com exatamente uma parcela. Antes, a API
// aceitava e ignorava o pedido em silêncio.
const twoInstallmentsFirstPaid = [
  { dueDate: "2026-06-01", amount: 25, paidNow: true },
  { dueDate: "2026-07-01", amount: 25 },
];
const twoInstallmentsBothPaid = [
  { dueDate: "2026-06-01", amount: 25, paidNow: true },
  { dueDate: "2026-07-01", amount: 25, paidNow: true },
];
const twoInstallmentsPending = [
  { dueDate: "2026-06-01", amount: 25 },
  { dueDate: "2026-07-01", amount: 25 },
];

function issueMessages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? [] : result.error!.issues.map((issue) => issue.message);
}

describe("saleSchema - restrição de paidNow", () => {
  const basePayload = {
    clientRequestId: "req-1",
    status: "CONFIRMED",
    clientId: "client-1",
    categoryId: "cat-1",
    saleDate: "2026-06-01",
    items: [{ description: "Item", quantity: 1, unitPrice: 50 }],
  };

  it("aceita uma única parcela com paidNow: true (venda à vista)", () => {
    const result = saleSchema("BRL").safeParse({
      ...basePayload,
      installments: [{ dueDate: "2026-06-01", amount: 50, paidNow: true }],
    });
    expect(result.success).toBe(true);
  });

  it("aceita múltiplas parcelas quando nenhuma delas é paidNow: true", () => {
    expect(saleSchema("BRL").safeParse({ ...basePayload, installments: twoInstallmentsPending }).success).toBe(true);
  });

  it("aceita rascunho sem parcelas", () => {
    expect(saleSchema("BRL").safeParse({ ...basePayload, status: "DRAFT" }).success).toBe(true);
  });

  it("rejeita paidNow: true quando há mais de uma parcela, mesmo que só uma marque paidNow", () => {
    const result = saleSchema("BRL").safeParse({ ...basePayload, installments: twoInstallmentsFirstPaid });
    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain("Venda à vista (paga agora) só é permitida com uma única parcela.");
  });

  it("rejeita mais de uma parcela com paidNow: true", () => {
    const result = saleSchema("BRL").safeParse({ ...basePayload, installments: twoInstallmentsBothPaid });
    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain("Apenas uma parcela pode ser marcada como paga agora.");
  });
});

describe("confirmSaleSchema - restrição de paidNow", () => {
  it("aceita uma única parcela com paidNow: true", () => {
    const result = confirmSaleSchema("BRL").safeParse({
      installments: [{ dueDate: "2026-06-01", amount: 50, paidNow: true }],
    });
    expect(result.success).toBe(true);
  });

  it("aceita múltiplas parcelas quando nenhuma delas é paidNow: true", () => {
    expect(confirmSaleSchema("BRL").safeParse({ installments: twoInstallmentsPending }).success).toBe(true);
  });

  it("rejeita paidNow: true quando há mais de uma parcela, mesmo que só uma marque paidNow", () => {
    const result = confirmSaleSchema("BRL").safeParse({ installments: twoInstallmentsFirstPaid });
    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain("Venda à vista (paga agora) só é permitida com uma única parcela.");
  });

  it("rejeita mais de uma parcela com paidNow: true", () => {
    const result = confirmSaleSchema("BRL").safeParse({ installments: twoInstallmentsBothPaid });
    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain("Apenas uma parcela pode ser marcada como paga agora.");
  });
});
