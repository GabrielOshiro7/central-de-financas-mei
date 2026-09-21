import { describe, it, expect } from "vitest";
import { appointmentCompleteSchema } from "@/lib/agenda/schema";

describe("appointmentCompleteSchema - restrição de paidNow (item 5, incremento 3)", () => {
  const basePayload = {
    categoryId: "cat-1",
    items: [{ description: "Corte", quantity: 1, unitPrice: 50 }],
  };

  it("aceita uma única parcela com paidNow: true", () => {
    const result = appointmentCompleteSchema("BRL").safeParse({
      ...basePayload,
      installments: [{ dueDate: "2026-06-01", amount: 50, paidNow: true }],
    });
    expect(result.success).toBe(true);
  });

  it("aceita múltiplas parcelas quando nenhuma delas é paidNow: true", () => {
    const result = appointmentCompleteSchema("BRL").safeParse({
      ...basePayload,
      installments: [
        { dueDate: "2026-06-01", amount: 25 },
        { dueDate: "2026-07-01", amount: 25 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita múltiplas parcelas com paidNow: true em mais de uma delas", () => {
    const result = appointmentCompleteSchema("BRL").safeParse({
      ...basePayload,
      installments: [
        { dueDate: "2026-06-01", amount: 25, paidNow: true },
        { dueDate: "2026-07-01", amount: 25, paidNow: true },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita paidNow: true quando há mais de uma parcela no total, mesmo que só uma marque paidNow", () => {
    const result = appointmentCompleteSchema("BRL").safeParse({
      ...basePayload,
      installments: [
        { dueDate: "2026-06-01", amount: 25, paidNow: true },
        { dueDate: "2026-07-01", amount: 25 },
      ],
    });
    expect(result.success).toBe(false);
  });
});
