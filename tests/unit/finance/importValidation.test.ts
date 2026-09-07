import { describe, it, expect } from "vitest";
import type { Category } from "@prisma/client";
import { validateImportRow } from "@/lib/finance/importValidation";

function makeCategory(overrides: Partial<Category>): Category {
  return {
    id: "cat-1",
    businessId: null,
    name: "Venda de produtos",
    type: "REVENUE",
    isDefault: true,
    active: true,
    createdAt: new Date(),
    ...overrides,
  } as Category;
}

const categories: Category[] = [
  makeCategory({ id: "rev-1", name: "Venda de produtos", type: "REVENUE" }),
  makeCategory({ id: "cost-1", name: "Mercadoria", type: "COST" }),
  makeCategory({ id: "exp-1", name: "Aluguel", type: "EXPENSE" }),
];

describe("validateImportRow", () => {
  it("aceita uma linha válida (data ISO)", () => {
    const row = validateImportRow(
      { data: "2026-09-01", tipo: "receita", categoria: "Venda de produtos", descricao: "Venda balcão", valor: "50000", observacao: "" },
      2,
      categories,
      "BRL"
    );
    expect(row.errors).toEqual([]);
    expect(row.type).toBe("REVENUE");
    expect(row.categoryId).toBe("rev-1");
    expect(row.amount).toBe(50000);
  });

  it("aceita categoria com maiúsculas/minúsculas e espaços diferentes", () => {
    const row = validateImportRow(
      { data: "2026-09-01", tipo: "CUSTO", categoria: "  mercadoria  ", descricao: "Compra", valor: "100", observacao: "" },
      2,
      categories,
      "BRL"
    );
    expect(row.errors).toEqual([]);
    expect(row.categoryId).toBe("cost-1");
  });

  it("aceita data no formato brasileiro dd/mm/aaaa", () => {
    const row = validateImportRow(
      { data: "05/09/2026", tipo: "despesa", categoria: "Aluguel", descricao: "Aluguel", valor: "1000", observacao: "" },
      2,
      categories,
      "BRL"
    );
    expect(row.errors).toEqual([]);
    expect(row.occurredAt).toEqual(new Date(2026, 8, 5));
  });

  it("rejeita valor inválido", () => {
    const row = validateImportRow(
      { data: "2026-09-01", tipo: "receita", categoria: "Venda de produtos", descricao: "Venda", valor: "abc", observacao: "" },
      3,
      categories,
      "BRL"
    );
    expect(row.errors).toContain("Valor inválido.");
  });

  it("rejeita valor menor ou igual a zero", () => {
    const row = validateImportRow(
      { data: "2026-09-01", tipo: "receita", categoria: "Venda de produtos", descricao: "Venda", valor: "0", observacao: "" },
      3,
      categories,
      "BRL"
    );
    expect(row.errors).toContain("O valor precisa ser maior que zero.");
  });

  it("rejeita categoria não encontrada", () => {
    const row = validateImportRow(
      { data: "2026-09-01", tipo: "receita", categoria: "Categoria Inexistente", descricao: "Venda", valor: "100", observacao: "" },
      4,
      categories,
      "BRL"
    );
    expect(row.errors).toContain("Categoria não encontrada.");
  });

  it("rejeita data inválida", () => {
    const row = validateImportRow(
      { data: "31/02/2026", tipo: "receita", categoria: "Venda de produtos", descricao: "Venda", valor: "100", observacao: "" },
      5,
      categories,
      "BRL"
    );
    expect(row.errors).toContain("Data inválida.");
  });

  it("rejeita tipo inválido", () => {
    const row = validateImportRow(
      { data: "2026-09-01", tipo: "lucro", categoria: "Venda de produtos", descricao: "Venda", valor: "100", observacao: "" },
      6,
      categories,
      "BRL"
    );
    expect(row.errors).toContain("Tipo inválido.");
  });

  it("rejeita valores com casas decimais quando a moeda é iene", () => {
    const row = validateImportRow(
      { data: "2026-09-01", tipo: "receita", categoria: "Venda de produtos", descricao: "Venda", valor: "100.50", observacao: "" },
      7,
      categories,
      "JPY"
    );
    expect(row.errors).toContain("Valores em iene não têm casas decimais.");
  });

  it("acumula múltiplos erros na mesma linha", () => {
    const row = validateImportRow(
      { data: "", tipo: "", categoria: "", descricao: "", valor: "", observacao: "" },
      8,
      categories,
      "BRL"
    );
    expect(row.errors.length).toBeGreaterThan(1);
  });
});
