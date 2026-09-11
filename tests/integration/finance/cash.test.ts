import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createTransaction } from "@/lib/finance/mutations";
import { createBill, settleBill } from "@/lib/finance/bills/mutations";
import { updateOpeningBalance } from "@/lib/finance/cash/mutations";
import { getCurrentCashBalance, getMonthlyCashSeries } from "@/lib/finance/cash/queries";

describe("posição de caixa (Etapa 5.1)", () => {
  let userId: string;
  let businessId: string;
  let revenueCategoryId: string;
  let expenseCategoryId: string;

  beforeAll(async () => {
    const [revenueCategory, expenseCategory] = await Promise.all([
      prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } }),
      prisma.category.findFirstOrThrow({ where: { businessId: null, type: "EXPENSE" } }),
    ]);
    revenueCategoryId = revenueCategory.id;
    expenseCategoryId = expenseCategory.id;

    const user = await prisma.user.create({
      data: {
        name: "Teste Caixa",
        email: `caixa-${Date.now()}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    userId = user.id;

    const business = await prisma.business.create({
      data: { userId, name: "Empresa Caixa", currency: "BRL" },
    });
    businessId = business.id;
  });

  beforeEach(async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.bill.deleteMany({ where: { businessId } });
    await prisma.business.update({ where: { id: businessId }, data: { openingBalance: 0, openingBalanceDate: null } });
  });

  afterAll(async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.bill.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  it("sem nenhum lançamento e sem saldo inicial configurado -> null (estado vazio)", async () => {
    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const cash = await getCurrentCashBalance(businessId, business);
    expect(cash).toBeNull();
  });

  it("cálculo com openingBalance configurado explicitamente", async () => {
    await updateOpeningBalance(userId, { openingBalance: 1000, openingBalanceDate: new Date(2026, 0, 1) });

    await createTransaction(businessId, userId, {
      type: "REVENUE",
      occurredAt: new Date(2026, 0, 10),
      description: "Venda",
      categoryId: revenueCategoryId,
      amount: 500,
    });
    await createTransaction(businessId, userId, {
      type: "EXPENSE",
      occurredAt: new Date(2026, 0, 15),
      description: "Aluguel",
      categoryId: expenseCategoryId,
      amount: 200,
    });

    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const cash = await getCurrentCashBalance(businessId, business);
    expect(cash).not.toBeNull();
    expect(cash!.configured).toBe(true);
    expect(cash!.balance.toNumber()).toBe(1300); // 1000 + 500 - 200
  });

  it("cálculo sem openingBalance configurado usa a data do primeiro lançamento como base implícita (saldo 0)", async () => {
    await createTransaction(businessId, userId, {
      type: "REVENUE",
      occurredAt: new Date(2026, 1, 1),
      description: "Primeira venda",
      categoryId: revenueCategoryId,
      amount: 1000,
    });
    await createTransaction(businessId, userId, {
      type: "REVENUE",
      occurredAt: new Date(2026, 1, 10),
      description: "Segunda venda",
      categoryId: revenueCategoryId,
      amount: 500,
    });

    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const cash = await getCurrentCashBalance(businessId, business);
    expect(cash).not.toBeNull();
    expect(cash!.configured).toBe(false);
    // O PRIMEIRO lancamento (dia 1) e a propria data-base -> excluido (fica
    // "embutido" no saldo inicial implicito de 0). So a segunda venda conta.
    expect(cash!.balance.toNumber()).toBe(500);
  });

  it("lançamentos anteriores ou na própria data de openingBalanceDate são excluídos do acumulado", async () => {
    await updateOpeningBalance(userId, { openingBalance: 100, openingBalanceDate: new Date(2026, 2, 10) });

    await createTransaction(businessId, userId, {
      type: "REVENUE",
      occurredAt: new Date(2026, 2, 5), // antes - excluido
      description: "Antiga",
      categoryId: revenueCategoryId,
      amount: 9999,
    });
    await createTransaction(businessId, userId, {
      type: "REVENUE",
      occurredAt: new Date(2026, 2, 10), // mesma data - excluido
      description: "Na data",
      categoryId: revenueCategoryId,
      amount: 8888,
    });
    await createTransaction(businessId, userId, {
      type: "REVENUE",
      occurredAt: new Date(2026, 2, 11), // depois - contado
      description: "Depois",
      categoryId: revenueCategoryId,
      amount: 50,
    });

    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const cash = await getCurrentCashBalance(businessId, business);
    expect(cash!.balance.toNumber()).toBe(150); // 100 + 50, nunca + 9999 nem + 8888
  });

  it("Bill com status PENDING nunca entra no cálculo do Caixa - só depois de confirmada (settleBill) vira FinancialEntry", async () => {
    await updateOpeningBalance(userId, { openingBalance: 0, openingBalanceDate: new Date(2026, 0, 1) });

    const bill = await createBill(businessId, "RECEIVABLE", {
      categoryId: revenueCategoryId,
      description: "Conta a receber pendente",
      amount: 700,
      dueDate: new Date(2026, 0, 20),
    });
    expect(bill.ok).toBe(true);
    if (!bill.ok) return;

    const businessBefore = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const cashBefore = await getCurrentCashBalance(businessId, businessBefore);
    expect(cashBefore!.balance.toNumber()).toBe(0); // conta PENDING nao conta

    const settled = await settleBill(businessId, userId, bill.value.id, new Date(2026, 0, 20));
    expect(settled.ok).toBe(true);

    const businessAfter = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const cashAfter = await getCurrentCashBalance(businessId, businessAfter);
    expect(cashAfter!.balance.toNumber()).toBe(700); // agora e um FinancialEntry real (source BILL)
  });

  it("consistência cruzada: o último ponto da série mensal bate exatamente com o saldo atual do card", async () => {
    const openingDate = new Date(2026, 0, 1);
    await updateOpeningBalance(userId, { openingBalance: 200, openingBalanceDate: openingDate });

    const now = new Date(2026, 2, 15); // meados de marco/2026

    await createTransaction(businessId, userId, {
      type: "REVENUE",
      occurredAt: new Date(2026, 0, 10),
      description: "Jan",
      categoryId: revenueCategoryId,
      amount: 300,
    });
    await createTransaction(businessId, userId, {
      type: "EXPENSE",
      occurredAt: new Date(2026, 1, 5),
      description: "Fev",
      categoryId: expenseCategoryId,
      amount: 50,
    });
    await createTransaction(businessId, userId, {
      type: "REVENUE",
      occurredAt: new Date(2026, 2, 10), // dentro do mes de "now", antes de "now"
      description: "Mar",
      categoryId: revenueCategoryId,
      amount: 40,
    });

    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const [current, series] = await Promise.all([
      getCurrentCashBalance(businessId, business),
      getMonthlyCashSeries(businessId, business, now),
    ]);

    expect(series).toHaveLength(3); // jan, fev, mar/2026
    const lastPoint = series[series.length - 1];
    expect(lastPoint.year).toBe(2026);
    expect(lastPoint.month).toBe(2); // marco (0-indexado)
    expect(lastPoint.balance.toNumber()).toBe(current!.balance.toNumber());
    expect(current!.balance.toNumber()).toBe(490); // 200 + 300 - 50 + 40

    // Confere tambem os pontos intermediarios (nao so o ultimo).
    expect(series[0].balance.toNumber()).toBe(500); // 200 + 300
    expect(series[1].balance.toNumber()).toBe(450); // 500 - 50
  });

  it("isolamento entre empresas: saldo de A nunca é afetado por lançamentos ou saldo inicial de B", async () => {
    const userB = await prisma.user.create({
      data: {
        name: "Teste Caixa B",
        email: `caixa-b-${Date.now()}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    const businessB = await prisma.business.create({
      data: { userId: userB.id, name: "Empresa Caixa B", currency: "BRL" },
    });

    await updateOpeningBalance(userId, { openingBalance: 100, openingBalanceDate: new Date(2026, 0, 1) });
    await updateOpeningBalance(userB.id, { openingBalance: 99999, openingBalanceDate: new Date(2026, 0, 1) });

    await createTransaction(businessId, userId, {
      type: "REVENUE",
      occurredAt: new Date(2026, 0, 10),
      description: "Venda A",
      categoryId: revenueCategoryId,
      amount: 50,
    });
    await createTransaction(businessB.id, userB.id, {
      type: "REVENUE",
      occurredAt: new Date(2026, 0, 10),
      description: "Venda B",
      categoryId: revenueCategoryId,
      amount: 777777,
    });

    const businessARow = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const cashA = await getCurrentCashBalance(businessId, businessARow);
    expect(cashA!.balance.toNumber()).toBe(150); // 100 + 50, nunca contaminado por B

    await prisma.financialEntry.deleteMany({ where: { businessId: businessB.id } });
    await prisma.business.delete({ where: { id: businessB.id } });
    await prisma.user.delete({ where: { id: userB.id } });
  });

  it("precisão decimal preservada no ciclo completo (banco real, não só em memória)", async () => {
    await updateOpeningBalance(userId, { openingBalance: "100.10", openingBalanceDate: new Date(2026, 0, 1) });
    await createTransaction(businessId, userId, {
      type: "EXPENSE",
      occurredAt: new Date(2026, 0, 5),
      description: "Despesa com centavos",
      categoryId: expenseCategoryId,
      amount: "0.20",
    });

    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const cash = await getCurrentCashBalance(businessId, business);
    expect(cash!.balance.toString()).toBe("99.9"); // nunca 99.89999999999999 (erro de float)
  });
});
