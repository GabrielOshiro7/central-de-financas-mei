import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { confirmImport, type ImportRowInput } from "@/lib/finance/importConfirm";
import { parseCsvBuffer, parseXlsxBuffer } from "@/lib/finance/importParsing";
import { generateXlsxTemplate } from "@/lib/finance/templates";

describe("importação de lançamentos financeiros", () => {
  let userId: string;
  let businessId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        name: "Teste Importacao",
        email: `import-${Date.now()}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    userId = user.id;
    const business = await prisma.business.create({
      data: { userId, name: "Empresa Importacao", currency: "BRL" },
    });
    businessId = business.id;
  });

  function row(overrides: Partial<ImportRowInput> & { rowNumber: number }): ImportRowInput {
    return {
      data: "2026-09-01",
      tipo: "receita",
      categoria: "Venda de produtos",
      descricao: "Venda balcão",
      valor: "500",
      observacao: "",
      ...overrides,
    };
  }

  // Teste 9: importar CSV válido.
  it("importa um CSV válido (template gerado pelo próprio sistema)", async () => {
    const csv =
      "data,tipo,categoria,descricao,valor,observacao\n" +
      "2026-09-01,receita,Venda de produtos,Venda balcão,700,Cliente Y\n";
    const parsed = parseCsvBuffer(Buffer.from(csv, "utf-8"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const rows: ImportRowInput[] = parsed.rows.map((r, i) => ({ rowNumber: i + 2, ...r }) as ImportRowInput);
    const result = await confirmImport(businessId, userId, "BRL", rows, "import_anyway");

    expect(result.inserted).toBe(1);
    expect(result.failed).toHaveLength(0);

    const stored = await prisma.financialEntry.findMany({ where: { businessId, source: "IMPORT" } });
    expect(stored.some((e) => e.description === "Venda balcão" && e.amount.toString() === "700")).toBe(true);
  });

  // Teste 10: importar Excel válido.
  it("importa um arquivo Excel válido", async () => {
    const buffer = await generateXlsxTemplate();
    const parsed = await parseXlsxBuffer(Buffer.from(buffer));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const rows: ImportRowInput[] = parsed.rows.map((r, i) => ({ rowNumber: i + 2, ...r }) as ImportRowInput);
    const result = await confirmImport(businessId, userId, "BRL", rows, "import_anyway");

    expect(result.inserted).toBe(3); // as 3 linhas de exemplo do template
    expect(result.failed).toHaveLength(0);
  });

  // Teste 11: arquivo/linha com erro não é inserida, mas o restante segue.
  it("não insere linhas com erro, mas insere as válidas do mesmo lote", async () => {
    const rows: ImportRowInput[] = [
      row({ rowNumber: 2, descricao: "Linha válida", valor: "300" }),
      row({ rowNumber: 3, descricao: "Linha com valor inválido", valor: "não é número" }),
      row({ rowNumber: 4, categoria: "Categoria que não existe" }),
    ];

    const result = await confirmImport(businessId, userId, "BRL", rows, "import_anyway");

    expect(result.inserted).toBe(1);
    expect(result.failed).toHaveLength(2);
    expect(result.failed.find((f) => f.rowNumber === 3)?.errors).toContain("Valor inválido.");
    expect(result.failed.find((f) => f.rowNumber === 4)?.errors).toContain("Categoria não encontrada.");
  });

  // Teste 12: coluna obrigatória ausente é detectada na leitura do arquivo.
  it("detecta coluna obrigatória ausente no arquivo", () => {
    const csv = "data,tipo,descricao,valor\n2026-09-01,receita,Venda,100\n"; // falta "categoria"
    const parsed = parseCsvBuffer(Buffer.from(csv, "utf-8"));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toMatch(/categoria/);
    }
  });

  // Teste 13: detectar possíveis duplicidades ao reimportar o mesmo lote.
  it("sinaliza como duplicado ao reimportar o mesmo lançamento, e não insere de novo quando a ação é 'skip'", async () => {
    const original = row({ rowNumber: 2, descricao: "Lançamento repetido", valor: "999" });

    const first = await confirmImport(businessId, userId, "BRL", [original], "import_anyway");
    expect(first.inserted).toBe(1);

    const second = await confirmImport(businessId, userId, "BRL", [original], "skip");
    expect(second.inserted).toBe(0);
    expect(second.skippedDuplicates).toBe(1);

    const totalWithThatDescription = await prisma.financialEntry.count({
      where: { businessId, description: "Lançamento repetido" },
    });
    expect(totalWithThatDescription).toBe(1);
  });

  it("permite importar mesmo assim quando o usuário opta por 'import_anyway'", async () => {
    const original = row({ rowNumber: 2, descricao: "Lançamento repetido de propósito", valor: "111" });

    await confirmImport(businessId, userId, "BRL", [original], "import_anyway");
    const second = await confirmImport(businessId, userId, "BRL", [original], "import_anyway");

    expect(second.inserted).toBe(1);

    const totalWithThatDescription = await prisma.financialEntry.count({
      where: { businessId, description: "Lançamento repetido de propósito" },
    });
    expect(totalWithThatDescription).toBe(2);
  });

  afterAll(async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });
});
