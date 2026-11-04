import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { POST as postAgenda } from "@/app/api/agenda/route";
import { POST as postUndo } from "@/app/api/agenda/[id]/undo/route";
import { completeDayAppointment } from "@/lib/agenda/dayCompletion";
import { completeAppointment } from "@/lib/agenda/mutations";
import { undoAppointmentCompletion } from "@/lib/agenda/undoCompletion";
import { revertBillSettlement, settleBill } from "@/lib/finance/bills/mutations";
import { cancelSale, updateSale } from "@/lib/sales/mutations";
import { getCurrentCashBalance } from "@/lib/finance/cash/queries";
import { addDays, clockFor, dateKeyToDbDate, todayKey } from "@/lib/time/zoned";

// Agenda A4: desfazer a conclusao (DAY e legado TIMED) estorna o dinheiro e
// cancela a venda numa unica transacao; reconcluir gera venda NOVA.
const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string } }));
vi.mock("@/lib/auth/cookies", () => ({ getCurrentUser: async () => session.user }));

const { Decimal } = Prisma;
const createdUserIds: string[] = [];
let serviceRevenueCategoryId: string;

const OPENING = new Decimal(1000);

async function login(timezone: string) {
  const user = await prisma.user.create({
    data: { name: "Teste A4", email: `a4-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "x" },
  });
  createdUserIds.push(user.id);
  const today = todayKey(clockFor({ timezone }));
  // Saldo inicial configurado antes de tudo: o Caixa = 1000 + receitas.
  const business = await prisma.business.create({
    data: { userId: user.id, name: `Empresa A4 ${timezone}`, currency: "BRL", timezone, openingBalance: OPENING, openingBalanceOn: dateKeyToDbDate(addDays(today, -30)) },
  });
  session.user = { id: user.id, name: user.name, email: user.email };
  const client = await prisma.client.create({ data: { businessId: business.id, name: "Cliente A4" } });
  const corte = await prisma.product.create({ data: { businessId: business.id, name: "Corte", type: "SERVICO", defaultPrice: new Decimal(60) } });
  return { userId: user.id, businessId: business.id, timezone, clientId: client.id, corteId: corte.id, today };
}

type Ctx = Awaited<ReturnType<typeof login>>;

const json = (url: string, body: unknown) =>
  new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function createDay(ctx: Ctx, overrides: Record<string, unknown> = {}) {
  const res = await postAgenda(
    json("http://test/api/agenda", {
      clientId: ctx.clientId,
      scheduledOn: ctx.today,
      services: [{ productId: ctx.corteId, quantity: 2, unitPrice: 55 }],
      categoryId: serviceRevenueCategoryId,
      paymentTiming: "AVISTA",
      paymentMethod: "PIX",
      installments: [],
      ...overrides,
    })
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function completeDay(ctx: Ctx, id: string) {
  const done = await completeDayAppointment(ctx.businessId, id, clockFor({ timezone: ctx.timezone }));
  if (!done.ok) throw new Error(done.error);
  return done.value;
}

async function undo(id: string, to: string) {
  const res = await postUndo(json(`http://test/api/agenda/${id}/undo`, { to }), params(id));
  return { status: res.status, ...((await res.json()) as { error?: string; cancelledSaleId?: string | null; reversedAmount?: string }) };
}

async function cash(ctx: Ctx) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  return (await getCurrentCashBalance(ctx.businessId, business))!.balance.toString();
}

const revenueOfDay = async (ctx: Ctx) =>
  prisma.financialEntry.count({ where: { businessId: ctx.businessId, type: "REVENUE", occurredOn: dateKeyToDbDate(ctx.today) } });

const saleWithBills = (id: string) => prisma.sale.findUniqueOrThrow({ where: { id }, include: { bills: { orderBy: { dueOn: "asc" } } } });

// Legado TIMED concluido pelo modal (a vista, recebido no dia do atendimento).
async function completedTimed(ctx: Ctx) {
  const startAt = new Date(Date.now() - 2 * 3_600_000);
  const timed = await prisma.appointment.create({
    data: {
      businessId: ctx.businessId,
      clientId: ctx.clientId,
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      services: { create: [{ productId: ctx.corteId, nameSnapshot: "Corte", durationMinutesSnapshot: 30, position: 0 }] },
    },
  });
  await completeTimed(ctx, timed.id);
  return timed.id;
}

async function completeTimed(ctx: Ctx, id: string) {
  const done = await completeAppointment(
    ctx.businessId,
    ctx.userId,
    id,
    {
      categoryId: serviceRevenueCategoryId,
      items: [{ productId: ctx.corteId, description: "Corte", quantity: 1, unitPrice: 60 }],
      paymentMethod: "PIX",
      installments: [{ dueDate: ctx.today, amount: 60, paidNow: true }],
    },
    ctx.timezone
  );
  if (!done.ok) throw new Error(done.error);
  return done.value;
}

beforeAll(async () => {
  serviceRevenueCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE", name: "Venda de serviços" } })).id;
});

afterAll(async () => {
  const businesses = await prisma.business.findMany({ where: { userId: { in: createdUserIds } }, select: { id: true } });
  const ids = businesses.map((b) => b.id);
  await prisma.appointment.updateMany({ where: { businessId: { in: ids } }, data: { saleId: null } });
  await prisma.financialEntry.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.bill.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.sale.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.appointment.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.product.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.client.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe.each(["Asia/Tokyo", "America/Sao_Paulo"] as const)("desfazer conclusão - empresa em %s", (tz) => {
  it.each(["AGENDADO", "FALTOU", "CANCELADO"] as const)(
    "DAY à vista concluído -> desfazer para %s: Caixa e Receitas voltam, venda cancelada, fora do automático, completionSeq +1",
    async (to) => {
      const ctx = await login(tz);
      const id = await createDay(ctx);
      const cashBefore = await cash(ctx);
      const { saleId } = await completeDay(ctx, id);
      expect(await cash(ctx)).toBe(OPENING.plus(110).toString());
      expect(await revenueOfDay(ctx)).toBe(1);

      const undone = await undo(id, to);
      expect(undone).toMatchObject({ status: 200, cancelledSaleId: saleId, reversedAmount: "110" });

      expect(await cash(ctx)).toBe(cashBefore);
      expect(await revenueOfDay(ctx)).toBe(0);
      const sale = await saleWithBills(saleId!);
      expect(sale.status).toBe("CANCELLED");
      expect(sale.appointmentId).toBe(id); // rastro
      expect(sale.bills.map((b) => [b.status, b.paidOn, b.paidAt])).toEqual([["CANCELLED", null, null]]);

      const a = await prisma.appointment.findUniqueOrThrow({ where: { id } });
      expect([a.status, a.saleId, a.autoCompleteEligible, a.completionSeq, a.completedAt]).toEqual([to, null, false, 1, null]);
      expect(a.cancelledAt !== null).toBe(to === "CANCELADO");
    }
  );

  it("a prazo com 1 de 2 parcelas paga: estorna só o recebido e cancela tudo", async () => {
    const ctx = await login(tz);
    const id = await createDay(ctx, {
      paymentTiming: "APRAZO",
      installments: [
        { dueOn: ctx.today, amount: 40 },
        { dueOn: addDays(ctx.today, 30), amount: 70 },
      ],
    });
    const cashBefore = await cash(ctx);
    const { saleId } = await completeDay(ctx, id);
    const [first] = (await saleWithBills(saleId!)).bills;
    expect((await settleBill(ctx.businessId, ctx.userId, first.id, ctx.today)).ok).toBe(true);
    expect(await cash(ctx)).toBe(OPENING.plus(40).toString());

    const undone = await undo(id, "FALTOU");
    expect(undone).toMatchObject({ status: 200, reversedAmount: "40" });
    expect(await cash(ctx)).toBe(cashBefore);
    expect(await prisma.financialEntry.count({ where: { businessId: ctx.businessId } })).toBe(0);
    const sale = await saleWithBills(saleId!);
    expect(sale.status).toBe("CANCELLED");
    expect(sale.bills.map((b) => [b.amount.toString(), b.status, b.paidOn, b.paidAt])).toEqual([
      ["40", "CANCELLED", null, null],
      ["70", "CANCELLED", null, null],
    ]);
  });

  it("venda editada depois da conclusão: estorna e cancela o estado ATUAL da venda", async () => {
    const ctx = await login(tz);
    const id = await createDay(ctx, { paymentTiming: "APRAZO", installments: [{ dueOn: addDays(ctx.today, 10), amount: 110 }] });
    const { saleId } = await completeDay(ctx, id);
    const edited = await updateSale(ctx.businessId, saleId!, {
      clientId: ctx.clientId,
      categoryId: serviceRevenueCategoryId,
      saleOn: ctx.today,
      items: [{ productId: ctx.corteId, description: "Corte", quantity: 3, unitPrice: 50 }],
      discount: null,
      installments: [
        { dueOn: addDays(ctx.today, 5), amount: 100 },
        { dueOn: addDays(ctx.today, 35), amount: 50 },
      ],
    });
    expect(edited.ok).toBe(true);
    const [paid] = (await saleWithBills(saleId!)).bills;
    await settleBill(ctx.businessId, ctx.userId, paid.id, ctx.today);

    const undone = await undo(id, "AGENDADO");
    expect(undone).toMatchObject({ status: 200, reversedAmount: "100" });
    const sale = await saleWithBills(saleId!);
    expect([sale.status, sale.total.toString()]).toEqual(["CANCELLED", "150"]);
    expect(sale.bills.map((b) => [b.amount.toString(), b.status])).toEqual([
      ["100", "CANCELLED"],
      ["50", "CANCELLED"],
    ]);
    expect(await prisma.financialEntry.count({ where: { businessId: ctx.businessId } })).toBe(0);
  });

  it("venda já cancelada manualmente: só o atendimento muda", async () => {
    const ctx = await login(tz);
    const id = await createDay(ctx, { paymentTiming: "APRAZO", installments: [{ dueOn: addDays(ctx.today, 10), amount: 110 }] });
    const { saleId } = await completeDay(ctx, id);
    expect((await cancelSale(ctx.businessId, saleId!)).ok).toBe(true);
    const before = await prisma.sale.findUniqueOrThrow({ where: { id: saleId! } });

    const undone = await undo(id, "CANCELADO");
    expect(undone).toMatchObject({ status: 200, cancelledSaleId: null, reversedAmount: "0" });
    const after = await prisma.sale.findUniqueOrThrow({ where: { id: saleId! } });
    expect([after.status, after.updatedAt]).toEqual(["CANCELLED", before.updatedAt]);
    const a = await prisma.appointment.findUniqueOrThrow({ where: { id } });
    expect([a.status, a.saleId, a.completionSeq]).toEqual(["CANCELADO", null, 1]);
  });

  it("valor zero (sem venda): só muda o status", async () => {
    const ctx = await login(tz);
    const id = await createDay(ctx, { services: [{ productId: ctx.corteId, quantity: 1, unitPrice: 0 }] });
    expect((await completeDay(ctx, id)).saleId).toBeNull();
    const salesBefore = await prisma.sale.count({ where: { businessId: ctx.businessId } });

    expect(await undo(id, "FALTOU")).toMatchObject({ status: 200, cancelledSaleId: null, reversedAmount: "0" });
    const a = await prisma.appointment.findUniqueOrThrow({ where: { id } });
    expect([a.status, a.autoCompleteEligible, a.completionSeq]).toEqual(["FALTOU", false, 1]);
    expect(await prisma.sale.count({ where: { businessId: ctx.businessId } })).toBe(salesBefore);
  });

  it("desfazer duas vezes: a segunda devolve 'já foi desfeita' e não estorna de novo", async () => {
    const ctx = await login(tz);
    const id = await createDay(ctx);
    await completeDay(ctx, id);
    expect((await undo(id, "FALTOU")).status).toBe(200);
    const cashAfterFirst = await cash(ctx);

    const second = await undo(id, "CANCELADO");
    expect(second).toMatchObject({ status: 400, error: "Esta conclusão já foi desfeita." });
    expect(await cash(ctx)).toBe(cashAfterFirst);
    const a = await prisma.appointment.findUniqueOrThrow({ where: { id } });
    expect([a.status, a.completionSeq]).toEqual(["FALTOU", 1]);
  });

  it("desfazer duas vezes ao mesmo tempo: um único efeito", async () => {
    const ctx = await login(tz);
    const id = await createDay(ctx);
    const { saleId } = await completeDay(ctx, id);

    const results = await Promise.all([
      undoAppointmentCompletion(ctx.businessId, id, "AGENDADO"),
      undoAppointmentCompletion(ctx.businessId, id, "CANCELADO"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map((r) => !r.ok && r.error)).toEqual(["Esta conclusão já foi desfeita."]);

    const a = await prisma.appointment.findUniqueOrThrow({ where: { id } });
    expect(a.completionSeq).toBe(1);
    expect((await saleWithBills(saleId!)).status).toBe("CANCELLED");
    expect(await cash(ctx)).toBe(OPENING.toString());
  });

  it("DAY: desfazer -> reconcluir gera venda NOVA (agenda:<id>:1); a antiga continua cancelada", async () => {
    const ctx = await login(tz);
    const id = await createDay(ctx);
    const first = await completeDay(ctx, id);
    await undo(id, "AGENDADO");

    const second = await completeDay(ctx, id);
    expect(second.alreadyCompleted).toBe(false);
    expect(second.saleId).not.toBe(first.saleId);
    const [oldSale, newSale] = await Promise.all([saleWithBills(first.saleId!), saleWithBills(second.saleId!)]);
    expect([oldSale.status, oldSale.clientRequestId]).toEqual(["CANCELLED", `agenda:${id}:0`]);
    expect([newSale.status, newSale.clientRequestId, newSale.appointmentId]).toEqual(["CONFIRMED", `agenda:${id}:1`, id]);
    expect(await cash(ctx)).toBe(OPENING.plus(110).toString());
    expect(await revenueOfDay(ctx)).toBe(1);
  });

  it("TIMED legado concluído -> desfazer: estorna, cancela a venda e grava o rastro", async () => {
    const ctx = await login(tz);
    const id = await completedTimed(ctx);
    const { saleId } = (await prisma.appointment.findUniqueOrThrow({ where: { id } })) as { saleId: string };
    expect(await cash(ctx)).toBe(OPENING.plus(60).toString());

    expect(await undo(id, "FALTOU")).toMatchObject({ status: 200, cancelledSaleId: saleId, reversedAmount: "60" });
    expect(await cash(ctx)).toBe(OPENING.toString());
    const sale = await saleWithBills(saleId);
    expect([sale.status, sale.appointmentId]).toEqual(["CANCELLED", id]);
    const a = await prisma.appointment.findUniqueOrThrow({ where: { id } });
    expect([a.status, a.saleId, a.autoCompleteEligible, a.completionSeq]).toEqual(["FALTOU", null, false, 1]);
  });

  it("TIMED: desfazer -> reconcluir gera venda NOVA (agenda:<id>:1), não reaproveita a cancelada", async () => {
    const ctx = await login(tz);
    const id = await completedTimed(ctx);
    const oldSaleId = (await prisma.appointment.findUniqueOrThrow({ where: { id } })).saleId!;
    await undo(id, "AGENDADO");

    const again = await completeTimed(ctx, id);
    expect(again.saleId).not.toBe(oldSaleId);
    const [oldSale, newSale] = await Promise.all([saleWithBills(oldSaleId), saleWithBills(again.saleId)]);
    expect([oldSale.status, oldSale.clientRequestId]).toEqual(["CANCELLED", `agenda:${id}`]);
    expect([newSale.status, newSale.clientRequestId]).toEqual(["CONFIRMED", `agenda:${id}:1`]);
    expect(await cash(ctx)).toBe(OPENING.plus(60).toString());
  });

  it("venda desfeita fica EXATAMENTE como uma cancelada pelo botão depois de reverter os pagamentos", async () => {
    const ctx = await login(tz);
    const installments = [
      { dueOn: ctx.today, amount: 40 },
      { dueOn: addDays(ctx.today, 30), amount: 70 },
    ];
    const completedWithFirstPaid = async () => {
      const id = await createDay(ctx, { paymentTiming: "APRAZO", installments });
      const { saleId } = await completeDay(ctx, id);
      const [first] = (await saleWithBills(saleId!)).bills;
      await settleBill(ctx.businessId, ctx.userId, first.id, ctx.today);
      return { id, saleId: saleId!, paidBillId: first.id };
    };
    const undone = await completedWithFirstPaid();
    const manual = await completedWithFirstPaid();

    expect((await undo(undone.id, "CANCELADO")).status).toBe(200);
    expect((await revertBillSettlement(ctx.businessId, manual.paidBillId)).ok).toBe(true);
    expect((await cancelSale(ctx.businessId, manual.saleId)).ok).toBe(true);

    const state = async (saleId: string) => {
      const sale = await saleWithBills(saleId);
      const entries = await prisma.financialEntry.count({ where: { billId: { in: sale.bills.map((b) => b.id) } } });
      return {
        sale: [sale.status, sale.total.toString(), sale.paymentMethod, sale.notes],
        bills: sale.bills.map((b) => [b.status, b.amount.toString(), b.dueOn.toISOString(), b.paidOn, b.paidAt]),
        entries,
      };
    };
    expect(await state(undone.saleId)).toEqual(await state(manual.saleId));
  });

  it("recusa destino inválido e atendimento não concluído", async () => {
    const ctx = await login(tz);
    const id = await createDay(ctx);
    expect((await undo(id, "CONFIRMADO")).status).toBe(400);
    expect(await undo(id, "AGENDADO")).toMatchObject({ status: 400, error: "Só é possível desfazer um atendimento concluído." });
  });
});
