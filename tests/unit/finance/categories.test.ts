import { describe, it, expect } from "vitest";
import { normalizeCategoryName } from "@/lib/finance/categories";

describe("normalizeCategoryName", () => {
  it("ignora maiúsculas/minúsculas e espaços extras", () => {
    expect(normalizeCategoryName("  Venda de Produtos  ")).toBe("venda de produtos");
    expect(normalizeCategoryName("VENDA   DE    PRODUTOS")).toBe("venda de produtos");
  });

  it("nomes equivalentes normalizam para o mesmo valor", () => {
    expect(normalizeCategoryName("Aluguel")).toBe(normalizeCategoryName(" aluguel "));
  });
});
