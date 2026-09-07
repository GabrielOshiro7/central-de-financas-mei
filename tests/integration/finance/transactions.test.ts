import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createTransaction, updateTransaction, deleteTransaction } from "@/lib/finance/mutations";

describe("mutações de lançamentos financeiros", () => {
  let userId: string;
  let businessId: string;
  let revenueCategoryId: string;
  let costCategoryId: string;
  let expenseCategoryId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        name: "Teste Transacoes",
        email: `transacoes-${Date.now()}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    userId = user.id;
    const business = await prisma.business.create({
      data: { userId, name: "Empresa Transacoes", currency: "BRL" },
    });
    businessId = business.id;

    const [revenueCategory, costCategory, expenseCategory] = await Promise.all([
      prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } }),
      prisma.category.findFirstOrThrow({ where: { businessId: null, type: "COST" } }),
      prisma.category.findFirstOrThrow({ where: { businessId: null, type: "EXPENSE" } }),
    ]);
    revenueCategoryId = revenueCategory.id;
    costCategoryId = costCategory.id;
    expenseCategoryId = expenseCategory.id;
  });

  // Testes 1-3: criar receita/custo/despesa.
  it("cria um lançamento de receita", async () => {
    const result = await createTransaction(businessId, userId, {
      type: "REVENUE",
      occurredAt: new Date(),
      description: "Venda balcão",
      categoryId: revenueCategoryId,
      amount: 500,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const stored = await prisma.financialEntry.findUnique({ where: { id: result.value.id } });
      expect(stored?.type).toBe("REVENUE");
      expect(stored?.amount.toString()).toBe("500");
      expect(stored?.source).toBe("MANUAL");
    }
  });

  it("cria um lançamento de custo", async () => {
    const result = await createTransaction(businessId, userId, {
      type: "COST",
      occurredAt: new Date(),
      description: "Compra de mercadoria",
      categoryId: costCategoryId,
      amount: 200,
    });
    expect(result.ok).toBe(true);
  });

  it("cria um lançamento de despesa", async () => {
    const result = await createTransaction(businessId, userId, {
      type: "EXPENSE",
      occurredAt: new Date(),
      description: "Aluguel de setembro",
      categoryId: expenseCategoryId,
      amount: 1000,
    });
    expect(result.ok).toBe(true);
  });

  it("rejeita categoria que não corresponde ao tipo do lançamento", async () => {
    const result = await createTransaction(businessId, userId, {
      type: "REVENUE",
      occurredAt: new Date(),
      description: "Venda errada",
      categoryId: expenseCategoryId, // categoria de despesa num lancamento de receita
      amount: 100,
    });
    expect(result.ok).toBe(false);
  });

  // Teste 6: editar lançamento.
  it("edita um lançamento existente", async () => {
    const created = await createTransaction(businessId, userId, {
      type: "EXPENSE",
      occurredAt: new Date(),
      description: "Descrição original",
      categoryId: expenseCategoryId,
      amount: 100,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateTransaction(businessId, created.value.id, {
      type: "EXPENSE",
      occurredAt: new Date(),
      description: "Descrição corrigida",
      categoryId: expenseCategoryId,
      amount: 150,
    });
    expect(updated.ok).toBe(true);

    const stored = await prisma.financialEntry.findUnique({ where: { id: created.value.id } });
    expect(stored?.description).toBe("Descrição corrigida");
    expect(stored?.amount.toString()).toBe("150");
  });

  // Teste 7: excluir lançamento.
  it("exclui um lançamento existente", async () => {
    const created = await createTransaction(businessId, userId, {
      type: "COST",
      occurredAt: new Date(),
      description: "Para excluir",
      categoryId: costCategoryId,
      amount: 50,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const deleted = await deleteTransaction(businessId, created.value.id);
    expect(deleted.ok).toBe(true);

    const stored = await prisma.financialEntry.findUnique({ where: { id: created.value.id } });
    expect(stored).toBeNull();
  });

  afterAll(async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });
});

// Teste 14: usuário/empresa A não acessa nem altera lançamentos da empresa B.
describe("isolamento de lançamentos entre empresas", () => {
  let userAId: string;
  let userBId: string;
  let businessAId: string;
  let businessBId: string;
  let entryOfBId: string;

  beforeAll(async () => {
    const [userA, userB] = await Promise.all([
      prisma.user.create({
        data: {
          name: "Usuario A",
          email: `fin-iso-a-${Date.now()}@example.com`,
          passwordHash: await hashPassword("SenhaValida123"),
        },
      }),
      prisma.user.create({
        data: {
          name: "Usuario B",
          email: `fin-iso-b-${Date.now()}@example.com`,
          passwordHash: await hashPassword("SenhaValida123"),
        },
      }),
    ]);
    userAId = userA.id;
    userBId = userB.id;

    const [businessA, businessB] = await Promise.all([
      prisma.business.create({ data: { userId: userAId, name: "Empresa A", currency: "BRL" } }),
      prisma.business.create({ data: { userId: userBId, name: "Empresa B", currency: "BRL" } }),
    ]);
    businessAId = businessA.id;
    businessBId = businessB.id;

    const expenseCategory = await prisma.category.findFirstOrThrow({
      where: { businessId: null, type: "EXPENSE" },
    });

    const entryOfB = await prisma.financialEntry.create({
      data: {
        businessId: businessBId,
        userId: userBId,
        type: "EXPENSE",
        categoryId: expenseCategory.id,
        description: "Despesa da empresa B",
        amount: "300",
        occurredAt: new Date(),
      },
    });
    entryOfBId = entryOfB.id;
  });

  it("empresa A não consegue editar um lançamento da empresa B", async () => {
    const result = await updateTransaction(businessAId, entryOfBId, {
      type: "EXPENSE",
      occurredAt: new Date(),
      description: "Tentativa de alteração indevida",
      categoryId: entryOfBId,
      amount: 1,
    });
    expect(result.ok).toBe(false);

    const stillOriginal = await prisma.financialEntry.findUnique({ where: { id: entryOfBId } });
    expect(stillOriginal?.description).toBe("Despesa da empresa B");
  });

  it("empresa A não consegue excluir um lançamento da empresa B", async () => {
    const result = await deleteTransaction(businessAId, entryOfBId);
    expect(result.ok).toBe(false);

    const stillExists = await prisma.financialEntry.findUnique({ where: { id: entryOfBId } });
    expect(stillExists).not.toBeNull();
  });

  afterAll(async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
    await prisma.business.deleteMany({ where: { id: { in: [businessAId, businessBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  });
});
