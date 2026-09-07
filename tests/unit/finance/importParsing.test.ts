import { describe, it, expect } from "vitest";
import { parseCsvBuffer, parseXlsxBuffer, MAX_IMPORT_ROWS } from "@/lib/finance/importParsing";
import { generateCsvTemplate, generateXlsxTemplate } from "@/lib/finance/templates";

describe("parseCsvBuffer", () => {
  it("lê um CSV válido e normaliza os cabeçalhos", () => {
    const csv = "data,tipo,categoria,descricao,valor,observacao\n2026-09-01,receita,Venda de produtos,Venda balcão,50000,Cliente X\n";
    const result = parseCsvBuffer(Buffer.from(csv, "utf-8"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].tipo).toBe("receita");
      expect(result.rows[0].valor).toBe("50000");
    }
  });

  it("tolera cabeçalhos com acento/maiúsculas (ex.: Descrição, Observação)", () => {
    const csv = "Data,Tipo,Categoria,Descrição,Valor,Observação\n2026-09-01,receita,Venda de produtos,Venda,100,\n";
    const result = parseCsvBuffer(Buffer.from(csv, "utf-8"));
    expect(result.ok).toBe(true);
  });

  it("rejeita arquivo vazio", () => {
    const result = parseCsvBuffer(Buffer.alloc(0));
    expect(result.ok).toBe(false);
  });

  it("rejeita quando falta uma coluna obrigatória", () => {
    const csv = "data,tipo,categoria,descricao\n2026-09-01,receita,Venda de produtos,Venda\n";
    const result = parseCsvBuffer(Buffer.from(csv, "utf-8"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/valor/);
    }
  });

  it("rejeita arquivo malformado sem quebrar", () => {
    const result = parseCsvBuffer(Buffer.from('data,tipo\n"unterminated quote,x', "utf-8"));
    expect(result.ok).toBe(false);
  });

  it("rejeita quando o arquivo tem mais linhas que o limite permitido", () => {
    const header = "data,tipo,categoria,descricao,valor,observacao\n";
    const row = "2026-09-01,receita,Venda de produtos,Venda,100,\n";
    const csv = header + row.repeat(MAX_IMPORT_ROWS + 1);
    const result = parseCsvBuffer(Buffer.from(csv, "utf-8"));
    expect(result.ok).toBe(false);
  });
});

describe("parseXlsxBuffer", () => {
  it("lê um arquivo xlsx válido gerado pelo próprio template", async () => {
    const buffer = await generateXlsxTemplate();
    const result = await parseXlsxBuffer(Buffer.from(buffer));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows.length).toBeGreaterThanOrEqual(3);
      expect(result.rows[0].tipo).toBe("receita");
    }
  });

  it("rejeita um buffer que não é um xlsx válido", async () => {
    const result = await parseXlsxBuffer(Buffer.from("isso não é um arquivo excel"));
    expect(result.ok).toBe(false);
  });
});

describe("generateCsvTemplate", () => {
  it("gera um CSV que o próprio parser consegue ler de volta", () => {
    const csv = generateCsvTemplate();
    const result = parseCsvBuffer(Buffer.from(csv, "utf-8"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toHaveLength(3);
    }
  });
});
