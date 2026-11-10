import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import { Prisma, type EntrySource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PATCH as patchTransaction, DELETE as deleteTransactionRoute } from "@/app/api/financeiro/transactions/[id]/route";
import {
  BILL_ENTRY_LOCKED_MESSAGE,
  createTransaction,
  deleteTransaction,
  isBillLinkedEntry,
  updateTransaction,
} from "@/lib/finance/mutations";
import { createBill, revertBillSettlement, settleBill } from "@/lib/finance/bills/mutations";
import { createSale, cancelSale } from "@/lib/sales/mutations";
import { completeDayAppointment } from "@/lib/agenda/dayCompletion";
import { undoAppointmentCompletion } from "@/lib/agenda/undoCompletion";
import { clockFor, dateKeyToDbDate, todayKey } from "@/lib/time/zoned";

// Lancamento gerado por pagamento de conta (source BILL com billId): somente
// leitura em Lancamentos (mutation + rotas); BILL sem conta, MANUAL, IMPORT e
// RECURRING seguem editaveis; os fluxos de conta/venda/agenda continuam
// funcionando. Sessao simulada (rotas).
const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string } }));
vi.mock("@/lib/auth/cookies", () => ({
  getCurrentUser: async () => session.user,
  getCurrentUserWithSession: async () =>
    session.user ? { user: session.user, sessionId: "s", elevatedUntil: new Date(Date.now() + 3_600_000) } : null,
}));

const { Decimal } = Prisma;
const TZ = "America/Sao_Paulo";
let userId: string;
let businessId: string;
let clientId: string;
let revenueCategoryId: string;
let expenseCategoryId: string;
const today = todayKey(clockFor({ timezone: TZ }));

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { name: "Teste Lock", email: `lock-${Date.now()}@example.com`, passwordHash: "x" },
  });
  userId = user.id;
  session.user = { id: user.id, name: user.name, email: user.email };
  const business = await prisma.business.create({ data: { userId, name: "Empresa Lock", currency: "BRL", timezone: TZ } });
  businessId = business.id;
  clientId = (await prisma.client.create({ data: { businessId, name: "Cliente Lock" } })).id;
  revenueCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE", name: "Venda de serviços" } })).id;
  expenseCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "EXPENSE" } })).id;
});

afterAll(async () => {
  await prisma.appointment.updateMany({ where: { businessId }, data: { saleId: null } });
  await prisma.financialEntry.deleteMany({ where: { businessId } });
  await prisma.bill.deleteMany({ where: { businessId } });
  await prisma.sale.deleteMany({ where: { businessId } });
  await prisma.appointment.deleteMany({ where: { businessId } });
  await prisma.product.deleteMany({ where: { businessId } });
  await prisma.client.deleteMany({ where: { businessId } });
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

const input = (overrides: Record<string, unknown> = {}) => ({
  type: "EXPENSE" as const,
  occurredOn: today,
  description: "Lancamento",
  categoryId: expenseCategoryId,
  amount: 100,
  ...overrides,
});

// Conta a pagar paga -> lancamento BILL vinculado.
async function paidBillEntry(description = "Aluguel") {
  const bill = await createBill(businessId, "PAYABLE", { categoryId: expenseCategoryId, description, amount: 100, dueOn: today });
  if (!bill.ok) throw new Error(bill.error);
  const settled = await settleBill(businessId, userId, bill.value.id, today);
  if (!settled.ok) throw new Error(settled.error);
  return { billId: bill.value.id, entryId: settled.value.financialEntryId };
}

const entryRow = (id: string) => prisma.financialEntry.findUnique({ where: { id } });

describe("lançamento BILL vinculado a uma conta: somente leitura", () => {
  it("updateTransaction e deleteTransaction recusam e nada muda", async () => {
    const { entryId } = await paidBillEntry();
    const before = await entryRow(entryId);
    expect(isBillLinkedEntry(before!)).toBe(true);

    const updated = await updateTransaction(businessId, entryId, input({ description: "Alterado", amount: 999 }));
    expect(updated).toEqual({ ok: false, error: BILL_ENTRY_LOCKED_MESSAGE, code: "BILL_ENTRY_LOCKED" });
    const deleted = await deleteTransaction(businessId, entryId);
    expect(deleted).toEqual({ ok: false, error: BILL_ENTRY_LOCKED_MESSAGE, code: "BILL_ENTRY_LOCKED" });
    expect(BILL_ENTRY_LOCKED_MESSAGE).toBe(
      "Este lançamento foi gerado pelo pagamento de uma conta. Para alterá-lo, reverta o pagamento na conta."
    );

    expect(await entryRow(entryId)).toEqual(before); // intacto (inclusive updatedAt)
  });

  it("rotas PATCH e DELETE respondem 409 com a mensagem clara e nada muda", async () => {
    const { entryId } = await paidBillEntry("Luz");
    const before = await entryRow(entryId);
    const ctx = { params: Promise.resolve({ id: entryId }) };

    const patch = await patchTransaction(
      new Request("http://test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "EXPENSE", occurredAt: today, description: "X", categoryId: expenseCategoryId, amount: 5 }),
      }),
      ctx
    );
    expect([patch.status, ((await patch.json()) as { error: string }).error]).toEqual([409, BILL_ENTRY_LOCKED_MESSAGE]);

    const del = await deleteTransactionRoute(new Request("http://test", { method: "DELETE" }), ctx);
    expect([del.status, ((await del.json()) as { error: string }).error]).toEqual([409, BILL_ENTRY_LOCKED_MESSAGE]);

    expect(await entryRow(entryId)).toEqual(before);
  });

  it("entre empresas: segue 404 para um lançamento de outra empresa (o bloqueio não vaza)", async () => {
    const { entryId } = await paidBillEntry("Água");
    const result = await updateTransaction("outra-empresa", entryId, input());
    expect(result).toEqual({ ok: false, error: "Lançamento não encontrado." });
  });

  it("de venda (parcela à vista): também travado; Reverter pagamento pela conta continua funcionando e apaga o lançamento", async () => {
    const sale = await createSale(businessId, userId, {
      clientRequestId: `lock-${Date.now()}`,
      status: "CONFIRMED",
      clientId,
      categoryId: revenueCategoryId,
      saleOn: today,
      items: [{ description: "Item", quantity: 1, unitPrice: 50 }],
      discount: null,
      installments: [{ dueOn: today, amount: 50, paidNow: true }],
    });
    if (!sale.ok) throw new Error(sale.error);
    const bill = await prisma.bill.findFirstOrThrow({ where: { saleId: sale.value.id }, include: { financialEntry: true } });
    expect(bill.financialEntry?.source).toBe("BILL");
    expect((await deleteTransaction(businessId, bill.financialEntry!.id)).ok).toBe(false);

    expect((await revertBillSettlement(businessId, bill.id)).ok).toBe(true);
    expect(await entryRow(bill.financialEntry!.id)).toBeNull();
    // ...e a venda (agora sem parcela paga) pode ser cancelada.
    expect((await cancelSale(businessId, sale.value.id)).ok).toBe(true);
  });

  it("reverter o pagamento de uma conta avulsa continua apagando o lançamento (mesmo depois de tentativas bloqueadas)", async () => {
    const { billId, entryId } = await paidBillEntry("Internet");
    await updateTransaction(businessId, entryId, input());
    await deleteTransaction(businessId, entryId);
    expect((await revertBillSettlement(businessId, billId)).ok).toBe(true);
    expect(await entryRow(entryId)).toBeNull();
    expect((await prisma.bill.findUniqueOrThrow({ where: { id: billId } })).status).toBe("PENDING");
  });

  it("desfazer a conclusão de um atendimento (venda à vista) continua apagando o lançamento", async () => {
    const product = await prisma.product.create({ data: { businessId, name: "Corte Lock", type: "SERVICO", defaultPrice: new Decimal(70) } });
    const appointment = await prisma.appointment.create({
      data: {
        businessId,
        clientId,
        kind: "DAY",
        scheduledOn: dateKeyToDbDate(today),
        categoryId: revenueCategoryId,
        paymentTiming: "AVISTA",
        autoCompleteEligible: true,
        services: { create: [{ productId: product.id, nameSnapshot: "Corte Lock", unitPrice: new Decimal(70), position: 0 }] },
      },
    });
    const done = await completeDayAppointment(businessId, appointment.id, clockFor({ timezone: TZ }));
    if (!done.ok || !done.value.saleId) throw new Error("conclusão sem venda");
    const entry = await prisma.financialEntry.findFirstOrThrow({ where: { bill: { saleId: done.value.saleId } } });
    expect((await updateTransaction(businessId, entry.id, input())).ok).toBe(false); // travado

    const undone = await undoAppointmentCompletion(businessId, appointment.id, "AGENDADO");
    expect(undone.ok).toBe(true);
    expect(await entryRow(entry.id)).toBeNull();
  });
});

describe("o que continua editável/excluível", () => {
  it("BILL SEM conta (billId nulo, artefato antigo): editar e excluir como antes", async () => {
    const created = await createTransaction(businessId, userId, input({ description: "BILL órfão" }), "BILL");
    if (!created.ok) throw new Error(created.error);
    const row = await entryRow(created.value.id);
    expect([row?.source, row?.billId]).toEqual(["BILL", null]);
    expect(isBillLinkedEntry(row!)).toBe(false);

    expect((await updateTransaction(businessId, created.value.id, input({ description: "Editado", amount: 7 }))).ok).toBe(true);
    expect((await entryRow(created.value.id))?.description).toBe("Editado");
    expect((await deleteTransaction(businessId, created.value.id)).ok).toBe(true);
    expect(await entryRow(created.value.id)).toBeNull();
  });

  it.each(["MANUAL", "IMPORT", "RECURRING"] as EntrySource[])("%s: editar e excluir como antes", async (source) => {
    const created = await createTransaction(businessId, userId, input({ description: `Origem ${source}` }), source);
    if (!created.ok) throw new Error(created.error);
    expect((await updateTransaction(businessId, created.value.id, input({ description: "Mudou" }))).ok).toBe(true);
    expect((await entryRow(created.value.id))?.description).toBe("Mudou");

    const ctx = { params: Promise.resolve({ id: created.value.id }) };
    const del = await deleteTransactionRoute(new Request("http://test", { method: "DELETE" }), ctx);
    expect(del.status).toBe(200);
    expect(await entryRow(created.value.id)).toBeNull();
  });
});
