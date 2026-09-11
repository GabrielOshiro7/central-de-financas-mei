import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { calculateSaleTotals, deriveSalePaymentStatus, splitEqualInstallments } from "@/lib/sales/calculations";

const { Decimal } = Prisma;

describe("calculateSaleTotals", () => {
  it("calcula subtotal a partir de múltiplos itens (quantidade x preço unitário)", () => {
    const totals = calculateSaleTotals(
      [
        { quantity: 2, unitPrice: 100 },
        { quantity: 1, unitPrice: 150 },
      ],
      null
    );

    expect(totals.itemTotals[0].toString()).toBe("200");
    expect(totals.itemTotals[1].toString()).toBe("150");
    expect(totals.subtotal.toString()).toBe("350");
    expect(totals.discountAmount.toString()).toBe("0");
    expect(totals.total.toString()).toBe("350");
  });

  it("aplica desconto percentual (Cenário 6: 1000 - 10% = 900)", () => {
    const totals = calculateSaleTotals([{ quantity: 1, unitPrice: 1000 }], { type: "PERCENTAGE", value: 10 });

    expect(totals.subtotal.toString()).toBe("1000");
    expect(totals.discountAmount.toString()).toBe("100");
    expect(totals.total.toString()).toBe("900");
  });

  it("aplica desconto de valor fixo (300 sobre 3x100)", () => {
    const totals = calculateSaleTotals([{ quantity: 3, unitPrice: 100 }], { type: "FIXED", value: 30 });

    expect(totals.subtotal.toString()).toBe("300");
    expect(totals.total.toString()).toBe("270");
  });

  it("quantidade fracionária é aceita (ex.: 2.5kg)", () => {
    const totals = calculateSaleTotals([{ quantity: "2.5", unitPrice: 100 }], null);
    expect(totals.subtotal.toString()).toBe("250");
  });

  it("desconto maior que o subtotal produz total negativo (mutations.ts deve rejeitar - aqui só a matemática pura)", () => {
    const totals = calculateSaleTotals([{ quantity: 1, unitPrice: 100 }], { type: "FIXED", value: 500 });
    expect(totals.total.isNegative()).toBe(true);
  });
});

describe("deriveSalePaymentStatus", () => {
  const today = new Date(2026, 5, 15);
  const past = new Date(2026, 5, 1);
  const future = new Date(2026, 5, 30);

  it("sem parcelas (venda ainda em rascunho) => NAO_PAGA", () => {
    expect(deriveSalePaymentStatus([], today)).toBe("NAO_PAGA");
  });

  it("todas as parcelas PAID => PAGA", () => {
    expect(
      deriveSalePaymentStatus(
        [
          { status: "PAID", dueDate: past },
          { status: "PAID", dueDate: future },
        ],
        today
      )
    ).toBe("PAGA");
  });

  it("uma paga e outra pendente => PARCIAL (Cenário 2: 1 de 3 parcelas recebida)", () => {
    expect(
      deriveSalePaymentStatus(
        [
          { status: "PAID", dueDate: past },
          { status: "PENDING", dueDate: future },
          { status: "PENDING", dueDate: future },
        ],
        today
      )
    ).toBe("PARCIAL");
  });

  it("nenhuma paga, uma vencida => ATRASADA", () => {
    expect(
      deriveSalePaymentStatus([{ status: "PENDING", dueDate: past }], today)
    ).toBe("ATRASADA");
  });

  it("nenhuma paga, todas com vencimento futuro => NAO_PAGA", () => {
    expect(
      deriveSalePaymentStatus([{ status: "PENDING", dueDate: future }], today)
    ).toBe("NAO_PAGA");
  });

  it("parcela PARCIAL tem prioridade sobre ATRASADA quando já recebeu algo, mesmo com outra vencida", () => {
    expect(
      deriveSalePaymentStatus(
        [
          { status: "PAID", dueDate: past },
          { status: "PENDING", dueDate: past },
        ],
        today
      )
    ).toBe("PARCIAL");
  });

  it("parcelas canceladas são ignoradas na derivação", () => {
    expect(
      deriveSalePaymentStatus(
        [
          { status: "CANCELLED", dueDate: past },
          { status: "PAID", dueDate: future },
        ],
        today
      )
    ).toBe("PAGA");
  });
});

describe("splitEqualInstallments", () => {
  it("divide igualmente quando o total é múltiplo exato da quantidade de parcelas", () => {
    const result = splitEqualInstallments(new Decimal(300), 3, new Date(2026, 0, 10), 30, "BRL");
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.amount.toString() === "100")).toBe(true);
    expect(result[1].dueDate.getDate()).toBe(9); // 10/jan + 30 dias
  });

  it("coloca o resto da divisão na última parcela (BRL, 2 casas decimais)", () => {
    const result = splitEqualInstallments(new Decimal(100), 3, new Date(2026, 0, 1), 30, "BRL");
    expect(result[0].amount.toString()).toBe("33.33");
    expect(result[1].amount.toString()).toBe("33.33");
    expect(result[2].amount.toString()).toBe("33.34");
    const sum = result.reduce((t, r) => t.plus(r.amount), new Decimal(0));
    expect(sum.toString()).toBe("100");
  });

  it("JPY nunca gera parcela com casas decimais", () => {
    const result = splitEqualInstallments(new Decimal(1000), 3, new Date(2026, 0, 1), 30, "JPY");
    expect(result[0].amount.toString()).toBe("333");
    expect(result[1].amount.toString()).toBe("333");
    expect(result[2].amount.toString()).toBe("334");
  });

  it("count <= 0 retorna array vazio", () => {
    expect(splitEqualInstallments(new Decimal(100), 0, new Date(), 30, "BRL")).toEqual([]);
  });
});
