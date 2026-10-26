import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { confirmImport, type ImportRowInput, type CategoryDecision } from "@/lib/finance/importConfirm";
import { parseCsvBuffer, parseXlsxBuffer } from "@/lib/finance/importParsing";
import { generateXlsxTemplate } from "@/lib/finance/templates";
import { normalizeCategoryName } from "@/lib/finance/categoryName";
import { PROCESS_TZ } from "../../helpers/processClock";

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
    const result = await confirmImport(businessId, userId, "BRL", PROCESS_TZ, rows, "import_anyway");

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
    const result = await confirmImport(businessId, userId, "BRL", PROCESS_TZ, rows, "import_anyway");

    expect(result.inserted).toBe(3); // as 3 linhas de exemplo do template
    expect(result.failed).toHaveLength(0);
  });

  // Teste 11: arquivo/linha com erro não é inserida, mas o restante segue.
  it("não insere linhas com erro, mas insere as válidas do mesmo lote", async () => {
    const rows: ImportRowInput[] = [
      row({ rowNumber: 2, descricao: "Linha válida", valor: "300" }),
      row({ rowNumber: 3, descricao: "Linha com valor inválido", valor: "não é número" }),
      row({ rowNumber: 4, categoria: "" }), // categoria vazia continua bloqueando (Etapa 3.1, item 3)
    ];

    const result = await confirmImport(businessId, userId, "BRL", PROCESS_TZ, rows, "import_anyway");

    expect(result.inserted).toBe(1);
    expect(result.failed).toHaveLength(2);
    expect(result.failed.find((f) => f.rowNumber === 3)?.errors).toContain("Valor inválido.");
    expect(result.failed.find((f) => f.rowNumber === 4)?.errors).toContain("Categoria obrigatória.");
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

    const first = await confirmImport(businessId, userId, "BRL", PROCESS_TZ, [original], "import_anyway");
    expect(first.inserted).toBe(1);

    const second = await confirmImport(businessId, userId, "BRL", PROCESS_TZ, [original], "skip");
    expect(second.inserted).toBe(0);
    expect(second.skippedDuplicates).toBe(1);

    const totalWithThatDescription = await prisma.financialEntry.count({
      where: { businessId, description: "Lançamento repetido" },
    });
    expect(totalWithThatDescription).toBe(1);
  });

  it("permite importar mesmo assim quando o usuário opta por 'import_anyway'", async () => {
    const original = row({ rowNumber: 2, descricao: "Lançamento repetido de propósito", valor: "111" });

    await confirmImport(businessId, userId, "BRL", PROCESS_TZ, [original], "import_anyway");
    const second = await confirmImport(businessId, userId, "BRL", PROCESS_TZ, [original], "import_anyway");

    expect(second.inserted).toBe(1);

    const totalWithThatDescription = await prisma.financialEntry.count({
      where: { businessId, description: "Lançamento repetido de propósito" },
    });
    expect(totalWithThatDescription).toBe(2);
  });

  // ===== Etapa 3.1: categorias adaptaveis na importacao =====

  it("cria uma categoria nova automaticamente e associa ao lançamento certo", async () => {
    const categoryName = `Combustível ${Date.now()}`;
    const result = await confirmImport(
      businessId,
      userId,
      "BRL",
      PROCESS_TZ,
      [row({ rowNumber: 2, tipo: "custo", categoria: categoryName, descricao: "Abastecimento", valor: "150" })],
      "import_anyway"
    );

    expect(result.inserted).toBe(1);
    expect(result.categoriesCreated).toBe(1);
    expect(result.failed).toHaveLength(0);

    const category = await prisma.category.findFirst({
      where: { businessId, type: "COST", normalizedName: normalizeCategoryName(categoryName) },
    });
    expect(category).not.toBeNull();

    const entry = await prisma.financialEntry.findFirst({
      where: { businessId, description: "Abastecimento" },
    });
    expect(entry?.categoryId).toBe(category!.id);
  });

  it("mapeia categoria nova para uma categoria existente quando o usuário escolhe", async () => {
    const existingCategory = await prisma.category.findFirstOrThrow({
      where: { businessId: null, type: "EXPENSE" },
    });

    const rowNumber = 2;
    const decisions: CategoryDecision[] = [
      { key: `EXPENSE:${normalizeCategoryName("Salario")}`, action: "map", mapToCategoryId: existingCategory.id },
    ];

    const result = await confirmImport(
      businessId,
      userId,
      "BRL",
      PROCESS_TZ,
      [row({ rowNumber, tipo: "despesa", categoria: "Salario", descricao: "Pagamento", valor: "2000" })],
      "import_anyway",
      decisions
    );

    expect(result.inserted).toBe(1);
    expect(result.categoriesCreated).toBe(0);

    const entry = await prisma.financialEntry.findFirst({ where: { businessId, description: "Pagamento" } });
    expect(entry?.categoryId).toBe(existingCategory.id);
  });

  it("duas linhas com a mesma categoria nova criam só uma categoria", async () => {
    const categoryName = `Uber e táxi ${Date.now()}`;
    const result = await confirmImport(
      businessId,
      userId,
      "BRL",
      PROCESS_TZ,
      [
        row({ rowNumber: 2, tipo: "custo", categoria: categoryName, descricao: "Corrida 1", valor: "20" }),
        row({ rowNumber: 3, tipo: "custo", categoria: categoryName.toUpperCase(), descricao: "Corrida 2", valor: "25" }),
      ],
      "import_anyway"
    );

    expect(result.inserted).toBe(2);
    expect(result.categoriesCreated).toBe(1);

    const matchingCategories = await prisma.category.findMany({
      where: { businessId, type: "COST", normalizedName: normalizeCategoryName(categoryName) },
    });
    expect(matchingCategories).toHaveLength(1);

    const entries = await prisma.financialEntry.findMany({
      where: { businessId, description: { in: ["Corrida 1", "Corrida 2"] } },
    });
    expect(entries).toHaveLength(2);
    expect(entries[0].categoryId).toBe(entries[1].categoryId);
  });

  it("categoria vazia continua bloqueando a linha mesmo com o novo comportamento adaptável", async () => {
    const before = await prisma.financialEntry.count({ where: { businessId } });

    const result = await confirmImport(
      businessId,
      userId,
      "BRL",
      PROCESS_TZ,
      [row({ rowNumber: 2, categoria: "   ", descricao: "Sem categoria" })],
      "import_anyway"
    );

    expect(result.inserted).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].errors).toContain("Categoria obrigatória.");

    const after = await prisma.financialEntry.count({ where: { businessId } });
    expect(after).toBe(before);
  });

  // Teste de atomicidade (Etapa 3.1, item 6): uma falha na gravacao de UMA
  // linha (aqui, um valor que estoura a precisao do Decimal(14,2) no banco -
  // algo que so o Postgres rejeita, nao a validacao em memoria) desfaz a
  // transacao inteira - nenhuma categoria nova fica orfa, nenhum lancamento
  // do mesmo lote fica gravado.
  it("falha na gravação de uma linha desfaz a transação inteira (nenhuma categoria órfã)", async () => {
    const categoriesBefore = await prisma.category.count({ where: { businessId } });
    const entriesBefore = await prisma.financialEntry.count({ where: { businessId } });

    const newCategoryName = `Categoria Rollback ${Date.now()}`;
    const result = await confirmImport(
      businessId,
      userId,
      "BRL",
      PROCESS_TZ,
      [
        row({ rowNumber: 2, tipo: "custo", categoria: newCategoryName, descricao: "Linha que deveria ser desfeita", valor: "50" }),
        // 13 digitos antes da virgula: estoura Decimal(14,2), que permite no
        // maximo 12 digitos inteiros + 2 decimais.
        row({ rowNumber: 3, descricao: "Linha com valor absurdo", valor: "9999999999999.99" }),
      ],
      "import_anyway"
    );

    expect(result.inserted).toBe(0);
    expect(result.failed.length).toBeGreaterThan(0);

    const categoriesAfter = await prisma.category.count({ where: { businessId } });
    const entriesAfter = await prisma.financialEntry.count({ where: { businessId } });

    // Nem a categoria nova nem o lancamento valido do mesmo lote persistiram.
    expect(categoriesAfter).toBe(categoriesBefore);
    expect(entriesAfter).toBe(entriesBefore);

    const orphanCategory = await prisma.category.findFirst({
      where: { businessId, normalizedName: normalizeCategoryName(newCategoryName) },
    });
    expect(orphanCategory).toBeNull();
  });

  afterAll(async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.category.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });
});
