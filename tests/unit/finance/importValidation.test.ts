import { describe, it, expect } from "vitest";
import type { Category } from "@prisma/client";
import { validateImportRow } from "@/lib/finance/importValidation";
import { normalizeCategoryName } from "@/lib/finance/categoryName";

function makeCategory(overrides: Partial<Category>): Category {
  const name = overrides.name ?? "Venda de produtos";
  return {
    id: "cat-1",
    businessId: null,
    name,
    normalizedName: normalizeCategoryName(name),
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
  makeCategory({ id: "exp-2", name: "Água", type: "EXPENSE" }),
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
    expect(row.categoryStatus).toBe("existing");
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
    expect(row.categoryStatus).toBe("existing");
  });

  it("aceita categoria com acento diferente (Agua -> Água)", () => {
    const row = validateImportRow(
      { data: "2026-09-01", tipo: "despesa", categoria: "Agua", descricao: "Conta", valor: "80", observacao: "" },
      2,
      categories,
      "BRL"
    );
    expect(row.errors).toEqual([]);
    expect(row.categoryId).toBe("exp-2");
    expect(row.categoryStatus).toBe("existing");
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

  // Etapa 3.1 ("Categorias adaptaveis"): uma categoria que nao bate com nada
  // existente NAO bloqueia mais a linha - vira "new" para ser criada (ou
  // mapeada) na confirmacao, nunca um erro.
  it("categoria não encontrada não bloqueia a linha - fica marcada como 'new'", () => {
    const row = validateImportRow(
      { data: "2026-09-01", tipo: "receita", categoria: "Categoria Inexistente", descricao: "Venda", valor: "100", observacao: "" },
      4,
      categories,
      "BRL"
    );
    expect(row.errors).toEqual([]);
    expect(row.categoryStatus).toBe("new");
    expect(row.categoryId).toBeNull();
    expect(row.categoryNormalized).toBe("categoria inexistente");
  });

  // Etapa 3.1, item 3: so bloqueia se o campo estiver vazio/ausente.
  it("categoria vazia continua bloqueando a linha", () => {
    const row = validateImportRow(
      { data: "2026-09-01", tipo: "receita", categoria: "", descricao: "Venda", valor: "100", observacao: "" },
      4,
      categories,
      "BRL"
    );
    expect(row.errors).toContain("Categoria obrigatória.");
    expect(row.categoryStatus).toBe("missing");
  });

  it("categoria só com espaços em branco continua bloqueando a linha", () => {
    const row = validateImportRow(
      { data: "2026-09-01", tipo: "receita", categoria: "   ", descricao: "Venda", valor: "100", observacao: "" },
      4,
      categories,
      "BRL"
    );
    expect(row.errors).toContain("Categoria obrigatória.");
    expect(row.categoryStatus).toBe("missing");
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

  it("aceita valor com centavos quando a moeda é BRL", () => {
    const row = validateImportRow(
      { data: "2026-09-01", tipo: "receita", categoria: "Venda de produtos", descricao: "Venda", valor: "320.50", observacao: "" },
      7,
      categories,
      "BRL"
    );
    expect(row.errors).toEqual([]);
    expect(row.amount).toBe(320.5);
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
