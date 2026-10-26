import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createTransaction } from "@/lib/finance/mutations";
import { confirmImport, type ImportRowInput } from "@/lib/finance/importConfirm";
import { updateBusinessProfile, type BusinessEditInput } from "@/lib/onboarding/businessMutations";
import { PROCESS_TZ } from "../../helpers/processClock";

const { Decimal } = Prisma;

// Etapa 3.1, "Bug 1": moeda nunca inferida por locale - sempre o
// business.currency explicito. Cobre: BRL aceita centavos, JPY rejeita
// centavos (comportamento escolhido: rejeitar, nunca arredondar em silencio -
// ver comentario em validateImportRow), trava de troca de moeda com
// lancamentos existentes, e precisao exata do Decimal armazenado.
describe("moeda e precisao decimal (Etapa 3.1)", () => {
  let brlUserId: string;
  let jpyUserId: string;
  let brlBusinessId: string;
  let jpyBusinessId: string;
  let revenueCategoryId: string;

  beforeAll(async () => {
    const [brlUser, jpyUser, revenueCategory] = await Promise.all([
      prisma.user.create({
        data: {
          name: "Teste Moeda BRL",
          email: `moeda-brl-${Date.now()}@example.com`,
          passwordHash: await hashPassword("SenhaValida123"),
        },
      }),
      prisma.user.create({
        data: {
          name: "Teste Moeda JPY",
          email: `moeda-jpy-${Date.now()}@example.com`,
          passwordHash: await hashPassword("SenhaValida123"),
        },
      }),
      prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } }),
    ]);
    brlUserId = brlUser.id;
    jpyUserId = jpyUser.id;
    revenueCategoryId = revenueCategory.id;

    const [brlBusiness, jpyBusiness] = await Promise.all([
      prisma.business.create({ data: { userId: brlUserId, name: "Empresa BRL", currency: "BRL" } }),
      prisma.business.create({ data: { userId: jpyUserId, name: "Empresa JPY", currency: "JPY" } }),
    ]);
    brlBusinessId = brlBusiness.id;
    jpyBusinessId = jpyBusiness.id;
  });

  function importRow(overrides: Partial<ImportRowInput> & { rowNumber: number }): ImportRowInput {
    return {
      data: "2026-09-01",
      tipo: "receita",
      categoria: "Venda de produtos",
      descricao: "Venda balcão",
      valor: "100",
      observacao: "",
      ...overrides,
    };
  }

  it("empresa BRL importando valor com centavos passa sem erro", async () => {
    const result = await confirmImport(
      brlBusinessId,
      brlUserId,
      "BRL",
      PROCESS_TZ,
      [importRow({ rowNumber: 2, descricao: "Venda com centavos", valor: "320.50" })],
      "import_anyway"
    );
    expect(result.inserted).toBe(1);
    expect(result.failed).toHaveLength(0);

    const entry = await prisma.financialEntry.findFirst({
      where: { businessId: brlBusinessId, description: "Venda com centavos" },
    });
    expect(entry?.amount.toNumber()).toBe(320.5);
  });

  // Comportamento escolhido e documentado para JPY com decimais: REJEITAR a
  // linha (nunca arredondar em silencio um valor monetario). O usuario ve o
  // erro e corrige o arquivo ou o valor.
  it("empresa JPY importando valor com centavos é rejeitado com mensagem clara", async () => {
    const result = await confirmImport(
      jpyBusinessId,
      jpyUserId,
      "JPY",
      PROCESS_TZ,
      [importRow({ rowNumber: 2, descricao: "Venda inválida em iene", valor: "320.50" })],
      "import_anyway"
    );
    expect(result.inserted).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].errors).toContain("Valores em iene não têm casas decimais.");
  });

  it("empresa JPY importando valor inteiro passa sem erro", async () => {
    const result = await confirmImport(
      jpyBusinessId,
      jpyUserId,
      "JPY",
      PROCESS_TZ,
      [importRow({ rowNumber: 2, descricao: "Venda válida em iene", valor: "3200" })],
      "import_anyway"
    );
    expect(result.inserted).toBe(1);
    expect(result.failed).toHaveLength(0);
  });

  it("bloqueia a troca de moeda de uma empresa que já tem lançamentos", async () => {
    await createTransaction(brlBusinessId, brlUserId, {
      type: "REVENUE",
      occurredAt: new Date(),
      categoryId: revenueCategoryId,
      description: "Lançamento existente",
      amount: 100,
    });

    const input: BusinessEditInput = {
      name: "Empresa BRL",
      yearsInBusiness: "DE_1_A_3_ANOS",
      employeeCount: 5,
      currency: "USD", // tentando trocar de BRL para USD
      averageMonthlyRevenue: 1000,
    };

    const result = await updateBusinessProfile(brlUserId, input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/moeda/i);
    }

    const business = await prisma.business.findUnique({ where: { id: brlBusinessId } });
    expect(business?.currency).toBe("BRL");
  });

  it("permite trocar a moeda normalmente quando a empresa ainda não tem lançamentos", async () => {
    // Empresa isolada e propria para este teste: jpyBusinessId ja recebeu um
    // lancamento no teste anterior ("importando valor inteiro passa sem
    // erro"), entao usa-la aqui testaria sem querer o caminho bloqueado, nao
    // o caminho livre.
    const freshUser = await prisma.user.create({
      data: {
        name: "Teste Moeda Livre",
        email: `moeda-livre-${Date.now()}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    const freshBusiness = await prisma.business.create({
      data: { userId: freshUser.id, name: "Empresa Livre", currency: "BRL" },
    });

    const result = await updateBusinessProfile(freshUser.id, {
      name: "Empresa Livre",
      yearsInBusiness: "DE_1_A_3_ANOS",
      employeeCount: 3,
      currency: "USD",
      averageMonthlyRevenue: 500,
    });
    expect(result.ok).toBe(true);

    const updated = await prisma.business.findUnique({ where: { id: freshBusiness.id } });
    expect(updated?.currency).toBe("USD");

    await prisma.business.delete({ where: { id: freshBusiness.id } });
    await prisma.user.delete({ where: { id: freshUser.id } });
  });

  it("valores monetários com centavos são armazenados e recuperados sem erro de arredondamento", async () => {
    const cases: { description: string; input: string; expectedToString: string; expectedNumber: number }[] = [
      { description: "Precisão 10.10", input: "10.10", expectedToString: "10.1", expectedNumber: 10.1 },
      { description: "Precisão 33.33", input: "33.33", expectedToString: "33.33", expectedNumber: 33.33 },
      { description: "Precisão 0.01", input: "0.01", expectedToString: "0.01", expectedNumber: 0.01 },
    ];

    for (const { description, input } of cases) {
      const result = await createTransaction(brlBusinessId, brlUserId, {
        type: "REVENUE",
        occurredAt: new Date(),
        categoryId: revenueCategoryId,
        description,
        amount: input,
      });
      expect(result.ok).toBe(true);
    }

    const stored = await prisma.financialEntry.findMany({
      where: { businessId: brlBusinessId, description: { in: cases.map((c) => c.description) } },
    });

    for (const { description, expectedToString, expectedNumber } of cases) {
      const entry = stored.find((e) => e.description === description);
      expect(entry).toBeDefined();
      // decimal.js normaliza zeros a direita (10.10 -> "10.1"), diferente de
      // um float que poderia virar "10.099999999999998" por erro de
      // arredondamento binario - e exatamente isso que este teste prova que
      // NAO acontece aqui.
      expect(entry!.amount.toString()).toBe(expectedToString);
      expect(entry!.amount.toNumber()).toBe(expectedNumber);
    }

    const sum = stored.reduce((total, e) => total.plus(e.amount), new Decimal(0));
    expect(sum.toNumber()).toBeCloseTo(10.1 + 33.33 + 0.01, 10);
  });

  afterAll(async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId: { in: [brlBusinessId, jpyBusinessId] } } });
    await prisma.category.deleteMany({ where: { businessId: { in: [brlBusinessId, jpyBusinessId] } } });
    await prisma.business.deleteMany({ where: { id: { in: [brlBusinessId, jpyBusinessId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [brlUserId, jpyUserId] } } });
  });
});
