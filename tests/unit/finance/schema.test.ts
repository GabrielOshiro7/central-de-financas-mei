import { describe, it, expect } from "vitest";
import { transactionSchema } from "@/lib/finance/schema";

// Etapa 3.1, "Bug 1": a regra de casas decimais depende SOMENTE da moeda
// explicita da empresa passada para transactionSchema(currency) - nunca de
// locale/navegador/SO. Cobre o caminho de criacao/edicao manual de
// lancamento (o caminho de importacao tem sua propria suite em
// tests/unit/finance/importValidation.test.ts).
describe("transactionSchema - regra de casas decimais por moeda", () => {
  const baseInput = {
    type: "REVENUE" as const,
    occurredAt: "2026-09-01",
    description: "Venda",
    categoryId: "cat-1",
    notes: "",
  };

  it("BRL aceita valor com centavos", () => {
    const result = transactionSchema("BRL").safeParse({ ...baseInput, amount: 320.5 });
    expect(result.success).toBe(true);
  });

  it("USD aceita valor com centavos", () => {
    const result = transactionSchema("USD").safeParse({ ...baseInput, amount: 320.5 });
    expect(result.success).toBe(true);
  });

  it("JPY rejeita valor com centavos", () => {
    const result = transactionSchema("JPY").safeParse({ ...baseInput, amount: 320.5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Valores em iene não têm casas decimais.");
    }
  });

  it("JPY aceita valor inteiro", () => {
    const result = transactionSchema("JPY").safeParse({ ...baseInput, amount: 3200 });
    expect(result.success).toBe(true);
  });

  it("sem moeda definida (null), não aplica a regra de casas decimais", () => {
    // so pode acontecer para uma empresa que ainda nao terminou o
    // onboarding - nesse caso o modulo financeiro nem fica acessivel
    // (requireOnboardedUser), mas a funcao em si nao deve quebrar.
    const result = transactionSchema(null).safeParse({ ...baseInput, amount: 320.5 });
    expect(result.success).toBe(true);
  });

  it("rejeita valor zero ou negativo independente da moeda", () => {
    expect(transactionSchema("BRL").safeParse({ ...baseInput, amount: 0 }).success).toBe(false);
    expect(transactionSchema("BRL").safeParse({ ...baseInput, amount: -10 }).success).toBe(false);
  });
});
