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
import { processClock } from "../../helpers/processClock";
import { dbDateOfInstant, dbDateToKey, monthRange, startOfDayInstant } from "@/lib/time/zoned";

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
      dueOn: "2026-01-10",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/não é compatível/i);
  });

  it("cria uma conta a pagar como PENDING", async () => {
    const result = await createBill(businessId, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Aluguel de janeiro",
      amount: 1000,
      dueOn: "2026-01-10",
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
      dueOn: "2026-01-10",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const settled = await settleBill(businessId, userId, created.value.id, "2026-01-10");
    expect(settled.ok).toBe(true);

    const editAfterPaid = await updateBill(businessId, created.value.id, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Tentando editar após pago",
      amount: 999,
      dueOn: "2026-01-10",
    });
    expect(editAfterPaid.ok).toBe(false);
    if (!editAfterPaid.ok) expect(editAfterPaid.error).toMatch(/pendentes/i);
  });

  // Etapa F6b-2 (decisao do dono): o dia do pagamento informado vira
  // Bill.paidOn e o dia do lancamento (occurredOn; occurredAt = 00:00 desse
  // dia no fuso da empresa); Bill.paidAt passou a ser o instante REAL do
  // registro (auditoria), nao mais a data informada. Por isso as asserções de
  // paidAt/occurredAt abaixo mudaram de forma (o dia esperado nao mudou).
  it("settleBill: type do lançamento = category.type, dia do lançamento = dia do pagamento (não o vencimento)", async () => {
    const created = await createBill(businessId, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Conta paga com atraso",
      amount: 300,
      dueOn: "2026-01-05",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const paidOn = "2026-01-20"; // pago 15 dias depois do vencimento
    const registeredAt = new Date("2026-01-21T03:00:00.000Z"); // registrado no dia seguinte
    const settled = await settleBill(businessId, userId, created.value.id, paidOn, registeredAt);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;

    const entry = await prisma.financialEntry.findUnique({ where: { id: settled.value.financialEntryId } });
    expect(entry?.type).toBe("EXPENSE");
    expect(dbDateToKey(entry!.occurredOn)).toBe(paidOn);
    expect(entry?.occurredAt).toEqual(startOfDayInstant(paidOn, "Asia/Tokyo"));
    expect(entry?.source).toBe("BILL");
    expect(entry?.billId).toBe(created.value.id);
    expect(entry?.amount.toNumber()).toBe(300);

    const bill = await prisma.bill.findUnique({ where: { id: created.value.id } });
    expect(bill?.status).toBe("PAID");
    expect(dbDateToKey(bill!.paidOn!)).toBe(paidOn);
    expect(bill?.paidAt).toEqual(registeredAt);
  });

  it("idempotência: duas confirmações concorrentes na mesma conta geram no máximo um FinancialEntry", async () => {
    const created = await createBill(businessId, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Conta disputada por duplo clique",
      amount: 400,
      dueOn: "2026-01-05",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const paidOn = "2026-01-05";
    const [r1, r2] = await Promise.all([
      settleBill(businessId, userId, created.value.id, paidOn),
      settleBill(businessId, userId, created.value.id, paidOn),
    ]);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    // As duas chamadas devem apontar pro MESMO lançamento - nunca dois.
    expect(r1.value.financialEntryId).toBe(r2.value.financialEntryId);

    const entries = await prisma.financialEntry.findMany({ where: { billId: created.value.id } });
    expect(entries).toHaveLength(1);
  });

  // Regra nova (Etapa R): reverter APAGA o lançamento gerado pela liquidação.
  // Substitui a regra do ADENDO item 5 (desvincular e manter como avulso):
  // reverter significa que o pagamento não aconteceu, e manter o lançamento
  // fazia Caixa/Dashboard contarem dinheiro inexistente e permitia dupla
  // contagem ao liquidar de novo.
  it("reverter apaga o lançamento financeiro da liquidação e a conta volta a PENDING", async () => {
    const created = await createBill(businessId, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Conta a reverter",
      amount: 500,
      dueOn: "2026-01-05",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const settled = await settleBill(businessId, userId, created.value.id, "2026-01-05");
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;

    const reverted = await revertBillSettlement(businessId, created.value.id);
    expect(reverted.ok).toBe(true);

    const bill = await prisma.bill.findUnique({ where: { id: created.value.id } });
    expect(bill?.status).toBe("PENDING");
    expect(bill?.paidAt).toBeNull();

    const entry = await prisma.financialEntry.findUnique({ where: { id: settled.value.financialEntryId } });
    expect(entry).toBeNull();
    expect(await prisma.financialEntry.count({ where: { businessId } })).toBe(0);
  });

  describe("reverter liquidação (Etapa R)", () => {
    async function createAndSettle(direction: "PAYABLE" | "RECEIVABLE", description: string, amount = 300) {
      const created = await createBill(businessId, direction, {
        categoryId: direction === "PAYABLE" ? expenseCategoryId : revenueCategoryId,
        description,
        amount,
        dueOn: "2026-02-10",
      });
      if (!created.ok) throw new Error(created.error);
      const settled = await settleBill(businessId, userId, created.value.id, "2026-02-10");
      if (!settled.ok) throw new Error(settled.error);
      return { billId: created.value.id, entryId: settled.value.financialEntryId };
    }

    for (const direction of ["PAYABLE", "RECEIVABLE"] as const) {
      it(`${direction}: liquidar gera 1 lançamento; reverter deixa 0 lançamentos da conta e a conta pendente`, async () => {
        const { billId } = await createAndSettle(direction, `Reverter ${direction}`);
        expect(await prisma.financialEntry.count({ where: { billId } })).toBe(1);

        const reverted = await revertBillSettlement(businessId, billId);
        expect(reverted.ok).toBe(true);

        expect(await prisma.financialEntry.count({ where: { billId } })).toBe(0);
        expect(await prisma.financialEntry.count({ where: { businessId, source: "BILL" } })).toBe(0);
        const bill = await prisma.bill.findUniqueOrThrow({ where: { id: billId } });
        expect(bill.status).toBe("PENDING");
        expect(bill.paidAt).toBeNull();
      });

      it(`${direction}: liquidar → reverter → liquidar de novo deixa exatamente 1 lançamento`, async () => {
        const { billId } = await createAndSettle(direction, `Re-liquidar ${direction}`);
        await revertBillSettlement(businessId, billId);
        const again = await settleBill(businessId, userId, billId, "2026-02-12");
        expect(again.ok).toBe(true);

        expect(await prisma.financialEntry.count({ where: { businessId } })).toBe(1);
        const entry = await prisma.financialEntry.findFirstOrThrow({ where: { businessId } });
        expect(entry.billId).toBe(billId);
        // Dia informado (F6b-2): 00:00 de 12/02 no fuso da empresa (Toquio).
        expect(dbDateToKey(entry.occurredOn)).toBe("2026-02-12");
        expect(entry.occurredAt.getTime()).toBe(startOfDayInstant("2026-02-12", "Asia/Tokyo").getTime());
      });
    }

    it("reverter conta não liquidada: mesmo erro de antes e nada é apagado", async () => {
      const pending = await createBill(businessId, "PAYABLE", {
        categoryId: expenseCategoryId,
        description: "Ainda pendente",
        amount: 80,
        dueOn: "2026-02-10",
      });
      if (!pending.ok) throw new Error(pending.error);
      const { billId: paidId } = await createAndSettle("RECEIVABLE", "Outra já paga");
      const before = await prisma.financialEntry.count({ where: { businessId } });

      const result = await revertBillSettlement(businessId, pending.value.id);
      expect(result).toEqual({ ok: false, error: "Só é possível reverter uma conta já confirmada." });

      // Reverter duas vezes a mesma conta: a segunda cai no mesmo erro.
      expect((await revertBillSettlement(businessId, paidId)).ok).toBe(true);
      const second = await revertBillSettlement(businessId, paidId);
      expect(second).toEqual({ ok: false, error: "Só é possível reverter uma conta já confirmada." });

      expect(await prisma.financialEntry.count({ where: { businessId } })).toBe(before - 1);
      expect((await prisma.bill.findUniqueOrThrow({ where: { id: pending.value.id } })).status).toBe("PENDING");
    });

    it("não apaga lançamentos de outras contas nem manuais/recorrentes da mesma empresa", async () => {
      const target = await createAndSettle("PAYABLE", "Alvo do revert");
      const other = await createAndSettle("RECEIVABLE", "Outra conta");
      const manual = await prisma.financialEntry.create({
        data: { businessId, userId, type: "EXPENSE", categoryId: expenseCategoryId, description: "Manual", amount: 300, occurredAt: new Date(2026, 1, 10), occurredOn: dbDateOfInstant(new Date(2026, 1, 10), "Asia/Tokyo"), source: "MANUAL" },
      });
      const recurring = await prisma.financialEntry.create({
        data: { businessId, userId, type: "REVENUE", categoryId: revenueCategoryId, description: "Recorrente", amount: 300, occurredAt: new Date(2026, 1, 10), occurredOn: dbDateOfInstant(new Date(2026, 1, 10), "Asia/Tokyo"), source: "RECURRING" },
      });

      expect((await revertBillSettlement(businessId, target.billId)).ok).toBe(true);

      const remaining = await prisma.financialEntry.findMany({ where: { businessId }, select: { id: true } });
      expect(remaining.map((e) => e.id).sort()).toEqual([other.entryId, manual.id, recurring.id].sort());
    });

    it("lançamento editado manualmente depois da liquidação também é apagado no revert", async () => {
      const { billId, entryId } = await createAndSettle("PAYABLE", "Editado depois");
      await prisma.financialEntry.update({ where: { id: entryId }, data: { amount: 999, description: "Editado à mão" } });

      expect((await revertBillSettlement(businessId, billId)).ok).toBe(true);
      expect(await prisma.financialEntry.findUnique({ where: { id: entryId } })).toBeNull();
    });
  });

  it("não permite cancelar uma conta já paga, nem editar/pagar uma conta cancelada", async () => {
    const created = await createBill(businessId, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Conta a cancelar",
      amount: 150,
      dueOn: "2026-01-05",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const settled = await settleBill(businessId, userId, created.value.id, "2026-01-05");
    expect(settled.ok).toBe(true);

    const cancelPaid = await cancelBill(businessId, created.value.id);
    expect(cancelPaid.ok).toBe(false);

    await revertBillSettlement(businessId, created.value.id);
    const cancelled = await cancelBill(businessId, created.value.id);
    expect(cancelled.ok).toBe(true);

    const settleCancelled = await settleBill(businessId, userId, created.value.id);
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
      dueOn: "2026-01-05",
    });
    expect(billB.ok).toBe(true);
    if (!billB.ok) return;

    const crossSettle = await settleBill(businessId, userId, billB.value.id);
    expect(crossSettle.ok).toBe(false);

    const crossUpdate = await updateBill(businessId, billB.value.id, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Tentativa de edição cruzada",
      amount: 1,
      dueOn: "2026-01-05",
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
      dueOn: "2026-02-01",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const paidOn = "2026-02-03";
    const settled = await settleBill(businessId, userId, created.value.id, paidOn);
    expect(settled.ok).toBe(true);

    // Fevereiro no fuso da empresa (o filtro de periodo exige 00:00 nesse fuso).
    const range = monthRange(2026, 2, "Asia/Tokyo");
    const summary = await getFinancialSummaryForRange(businessId, range, "Asia/Tokyo");
    const { items } = await listTransactions(businessId, { type: "EXPENSE", range, pageSize: 100 }, "Asia/Tokyo");

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
      startOn: "2026-01-01",
    });
    expect(molde.ok).toBe(true);
    if (!molde.ok) return;

    const now = new Date(2026, 0, 15); // materializa com horizonte de 90 dias a partir daqui
    const [r1, r2] = await Promise.all([
      materializeRecurringBills(businessId, processClock(now)),
      materializeRecurringBills(businessId, processClock(now)),
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
    const r3 = await materializeRecurringBills(businessId, processClock(now));
    expect(r3.created).toBe(0);
  });

  it("getBillSummary: total vencido considera só PENDING com dueDate no passado", async () => {
    const overdue = await createBill(businessId, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Vencida",
      amount: 100,
      dueOn: "2020-01-01",
    });
    const future = await createBill(businessId, "PAYABLE", {
      categoryId: expenseCategoryId,
      description: "Futura",
      amount: 250,
      dueOn: "2099-01-01",
    });
    expect(overdue.ok && future.ok).toBe(true);

    const now = new Date(2026, 5, 1);
    const summary = await getBillSummary(businessId, "PAYABLE", { start: now, end: now }, processClock(now));
    expect(summary.totalOverdueAmount.toNumber()).toBe(100);
    expect(summary.totalPendingAmount.toNumber()).toBe(250);
    expect(summary.totalOpenAmount.toNumber()).toBe(350);
  });
});
