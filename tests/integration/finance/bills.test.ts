import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import {
  createBill,
  updateBill,
  cancelBill,
  settleBill,
  revertBillSettlement,
  createRecurringBill,
} from "@/lib/finance/bills/mutations";
import { materializeRecurringBills } from "@/lib/finance/bills/materialize";
import { getFinancialSummaryForRange, listTransactions } from "@/lib/finance/queries";
import { getBillSummary } from "@/lib/finance/bills/queries";

describe("contas a pagar/receber (Etapa 5)", () => {
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
        name: "Teste Contas",
        email: `contas-${Date.now()}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    userId = user.id;

    const business = await prisma.business.create({
      data: { userId, name: "Empresa Contas", currency: "BRL" },
    });
    businessId = business.id;
  });

  beforeEach(async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.bill.deleteMany({ where: { businessId } });
    await prisma.recurringBill.deleteMany({ where: { businessId } });
  });

  afterAll(async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.bill.deleteMany({ where: { businessId } });
    await prisma.recurringBill.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  it("rejeita categoria cuja direção não bate (categoria de receita numa conta a pagar)", async () => {
    const result = await createBill(businessId, "PAYABLE", {
      categoryId: revenueCategoryId,
      description: "Categoria incompatível",
      amount: 100,
      dueDate: new Date(2026, 0, 10),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/não é compatível/i);
  });

  it("cria uma conta a pagar como PENDING", async () => {
    const result = await createBill(businessId, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Aluguel de janeiro",
      amount: 1000,
      dueDate: new Date(2026, 0, 10),
      counterpartyName: "Imobiliária X",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const bill = await prisma.bill.findUnique({ where: { id: result.value.id } });
    expect(bill?.status).toBe("PENDING");
    expect(bill?.counterpartyName).toBe("Imobiliária X");
  });

  it("edição só é permitida enquanto a conta está PENDING", async () => {
    const created = await createBill(businessId, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Conta editável",
      amount: 200,
      dueDate: new Date(2026, 0, 10),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const settled = await settleBill(businessId, userId, created.value.id, new Date(2026, 0, 10));
    expect(settled.ok).toBe(true);

    const editAfterPaid = await updateBill(businessId, created.value.id, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Tentando editar após pago",
      amount: 999,
      dueDate: new Date(2026, 0, 10),
    });
    expect(editAfterPaid.ok).toBe(false);
    if (!editAfterPaid.ok) expect(editAfterPaid.error).toMatch(/pendentes/i);
  });

  it("settleBill: type do lançamento = category.type, occurredAt = data do pagamento (não dueDate)", async () => {
    const created = await createBill(businessId, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Conta paga com atraso",
      amount: 300,
      dueDate: new Date(2026, 0, 5),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const paidAt = new Date(2026, 0, 20); // pago 15 dias depois do vencimento
    const settled = await settleBill(businessId, userId, created.value.id, paidAt);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;

    const entry = await prisma.financialEntry.findUnique({ where: { id: settled.value.financialEntryId } });
    expect(entry?.type).toBe("EXPENSE");
    expect(entry?.occurredAt).toEqual(paidAt);
    expect(entry?.source).toBe("BILL");
    expect(entry?.billId).toBe(created.value.id);
    expect(entry?.amount.toNumber()).toBe(300);

    const bill = await prisma.bill.findUnique({ where: { id: created.value.id } });
    expect(bill?.status).toBe("PAID");
    expect(bill?.paidAt).toEqual(paidAt);
  });

  it("idempotência: duas confirmações concorrentes na mesma conta geram no máximo um FinancialEntry", async () => {
    const created = await createBill(businessId, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Conta disputada por duplo clique",
      amount: 400,
      dueDate: new Date(2026, 0, 5),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const paidAt = new Date(2026, 0, 5);
    const [r1, r2] = await Promise.all([
      settleBill(businessId, userId, created.value.id, paidAt),
      settleBill(businessId, userId, created.value.id, paidAt),
    ]);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    // As duas chamadas devem apontar pro MESMO lançamento - nunca dois.
    expect(r1.value.financialEntryId).toBe(r2.value.financialEntryId);

    const entries = await prisma.financialEntry.findMany({ where: { billId: created.value.id } });
    expect(entries).toHaveLength(1);
  });

  it("reverter desvincula (não apaga) o lançamento financeiro e a conta volta a PENDING", async () => {
    const created = await createBill(businessId, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Conta a reverter",
      amount: 500,
      dueDate: new Date(2026, 0, 5),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const settled = await settleBill(businessId, userId, created.value.id, new Date(2026, 0, 5));
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;

    const reverted = await revertBillSettlement(businessId, created.value.id);
    expect(reverted.ok).toBe(true);

    const bill = await prisma.bill.findUnique({ where: { id: created.value.id } });
    expect(bill?.status).toBe("PENDING");
    expect(bill?.paidAt).toBeNull();

    // O lançamento continua existindo (nunca apagado), só desvinculado.
    const entry = await prisma.financialEntry.findUnique({ where: { id: settled.value.financialEntryId } });
    expect(entry).not.toBeNull();
    expect(entry?.billId).toBeNull();
  });

  it("não permite cancelar uma conta já paga, nem editar/pagar uma conta cancelada", async () => {
    const created = await createBill(businessId, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Conta a cancelar",
      amount: 150,
      dueDate: new Date(2026, 0, 5),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const settled = await settleBill(businessId, userId, created.value.id, new Date(2026, 0, 5));
    expect(settled.ok).toBe(true);

    const cancelPaid = await cancelBill(businessId, created.value.id);
    expect(cancelPaid.ok).toBe(false);

    await revertBillSettlement(businessId, created.value.id);
    const cancelled = await cancelBill(businessId, created.value.id);
    expect(cancelled.ok).toBe(true);

    const settleCancelled = await settleBill(businessId, userId, created.value.id, new Date());
    expect(settleCancelled.ok).toBe(false);
  });

  it("isolamento: empresa A nunca consegue confirmar/editar conta da empresa B", async () => {
    const userB = await prisma.user.create({
      data: {
        name: "Teste Contas B",
        email: `contas-b-${Date.now()}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    const businessB = await prisma.business.create({
      data: { userId: userB.id, name: "Empresa Contas B", currency: "BRL" },
    });

    const billB = await createBill(businessB.id, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Conta da empresa B",
      amount: 999,
      dueDate: new Date(2026, 0, 5),
    });
    expect(billB.ok).toBe(true);
    if (!billB.ok) return;

    const crossSettle = await settleBill(businessId, userId, billB.value.id, new Date());
    expect(crossSettle.ok).toBe(false);

    const crossUpdate = await updateBill(businessId, billB.value.id, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Tentativa de edição cruzada",
      amount: 1,
      dueDate: new Date(2026, 0, 5),
    });
    expect(crossUpdate.ok).toBe(false);

    await prisma.bill.deleteMany({ where: { businessId: businessB.id } });
    await prisma.business.delete({ where: { id: businessB.id } });
    await prisma.user.delete({ where: { id: userB.id } });
  });

  it("consistência cruzada: após pagar, o total do financeiro/dashboard bate com o FinancialEntry gerado", async () => {
    const created = await createBill(businessId, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Conta para conferência de totais",
      amount: 700,
      dueDate: new Date(2026, 1, 1),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const paidAt = new Date(2026, 1, 3);
    const settled = await settleBill(businessId, userId, created.value.id, paidAt);
    expect(settled.ok).toBe(true);

    const range = { start: new Date(2026, 1, 1), end: new Date(2026, 2, 1) };
    const summary = await getFinancialSummaryForRange(businessId, range);
    const { items } = await listTransactions(businessId, { type: "EXPENSE", range, pageSize: 100 });

    expect(summary.expenses.toNumber()).toBe(700);
    expect(items.some((i) => i.billId === created.value.id)).toBe(true);
  });

  it("materializeRecurringBills gera Bill PENDENTES no futuro (não FinancialEntry) e é idempotente sob concorrência", async () => {
    const molde = await createRecurringBill(businessId, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Aluguel recorrente",
      amount: 1000,
      frequency: "MONTHLY",
      dayOfMonth: 5,
      startDate: new Date(2026, 0, 1),
    });
    expect(molde.ok).toBe(true);
    if (!molde.ok) return;

    const now = new Date(2026, 0, 15); // materializa com horizonte de 90 dias a partir daqui
    const [r1, r2] = await Promise.all([
      materializeRecurringBills(businessId, now),
      materializeRecurringBills(businessId, now),
    ]);

    const bills = await prisma.bill.findMany({ where: { recurringBillId: molde.value.id } });
    expect(bills.length).toBeGreaterThan(0);
    expect(bills.every((b) => b.status === "PENDING")).toBe(true);
    expect(r1.created + r2.created).toBe(bills.length);

    // Nenhum FinancialEntry deve existir ainda - so PENDING, mesmo pra
    // ocorrências cujo vencimento já passou (dia 5, "now" é dia 15).
    const entries = await prisma.financialEntry.count({ where: { businessId } });
    expect(entries).toBe(0);

    // Rodar de novo não duplica.
    const r3 = await materializeRecurringBills(businessId, now);
    expect(r3.created).toBe(0);
  });

  it("getBillSummary: total vencido considera só PENDING com dueDate no passado", async () => {
    const overdue = await createBill(businessId, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Vencida",
      amount: 100,
      dueDate: new Date(2020, 0, 1),
    });
    const future = await createBill(businessId, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Futura",
      amount: 250,
      dueDate: new Date(2099, 0, 1),
    });
    expect(overdue.ok && future.ok).toBe(true);

    const now = new Date(2026, 5, 1);
    const summary = await getBillSummary(businessId, "PAYABLE", { start: now, end: now }, now);
    expect(summary.totalOverdueAmount.toNumber()).toBe(100);
    expect(summary.totalPendingAmount.toNumber()).toBe(250);
    expect(summary.totalOpenAmount.toNumber()).toBe(350);
  });
});
