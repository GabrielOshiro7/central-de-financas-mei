import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  cancelBill,
  createBill,
  createRecurringBill,
  revertBillSettlement,
  settleBill,
  updateBill,
  updateRecurringBill,
} from "@/lib/finance/bills/mutations";
import { materializeRecurringBills } from "@/lib/finance/bills/materialize";
import { createSale } from "@/lib/sales/mutations";
import { createAppointment, completeAppointment } from "@/lib/agenda/mutations";
import { clockFor, dbDateToKey, startOfDayInstant, toDateKey } from "@/lib/time/zoned";

// Etapa F6b-1 (expandir contas): todo caminho que grava Bill.dueDate/
// issueDate/paidAt ou RecurringBill.startDate/endDate grava TAMBEM a coluna
// de dia (dueOn/issueOn/paidOn/startOn/endOn) com o MESMO dia que o app
// enxerga no instante antigo, no fuso da empresa - e NULL junto com a antiga.
// Exercitado pelo codigo real (mutations), com os instantes como as rotas
// montam hoje (new Date("YYYY-MM-DD") = 00:00 UTC) e com hora real.
const TIME_ZONES = ["Asia/Tokyo", "America/Sao_Paulo", "UTC"] as const;
// 05:30 JST de 27/10 = 20:30 UTC de 26/10 = 17:30 de 26/10 em Sao Paulo.
const EARLY_JST = new Date("2026-10-26T20:30:00.000Z");

const created: { userId: string; businessId: string }[] = [];
let revenueCategoryId: string;
let expenseCategoryId: string;

async function newBusiness(timezone: string) {
  const user = await prisma.user.create({
    data: { name: "Teste F6b-1", email: `f6b1-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "x" },
  });
  const business = await prisma.business.create({ data: { userId: user.id, name: `Empresa F6b-1 ${timezone}`, currency: "BRL", timezone } });
  created.push({ userId: user.id, businessId: business.id });
  return { userId: user.id, businessId: business.id };
}

const keyOrNull = (d: Date | null) => (d ? dbDateToKey(d) : null);
const dayOrNull = (d: Date | null, tz: string) => (d ? toDateKey(d, tz) : null);

// Invariante sobre TODAS as contas e moldes da empresa.
async function assertBillsInvariant(businessId: string, tz: string) {
  const bills = await prisma.bill.findMany({ where: { businessId } });
  for (const b of bills) {
    const label = `${b.description} ${b.status}`;
    expect(dbDateToKey(b.dueOn), `${label} dueOn`).toBe(toDateKey(b.dueDate, tz));
    expect(keyOrNull(b.issueOn), `${label} issueOn`).toBe(dayOrNull(b.issueDate, tz));
    expect(keyOrNull(b.paidOn), `${label} paidOn`).toBe(dayOrNull(b.paidAt, tz));
  }
  const molds = await prisma.recurringBill.findMany({ where: { businessId } });
  for (const m of molds) {
    expect(dbDateToKey(m.startOn), `${m.description} startOn`).toBe(toDateKey(m.startDate, tz));
    expect(keyOrNull(m.endOn), `${m.description} endOn`).toBe(dayOrNull(m.endDate, tz));
  }
  return { bills, molds };
}

beforeAll(async () => {
  revenueCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE", name: "Venda de produtos" } })).id;
  expenseCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "EXPENSE" } })).id;
});

afterAll(async () => {
  const ids = created.map((c) => c.businessId);
  await prisma.appointmentService.deleteMany({ where: { appointment: { businessId: { in: ids } } } });
  await prisma.appointment.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.financialEntry.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.bill.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.sale.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.recurringBill.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.product.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.client.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: created.map((c) => c.userId) } } });
});

describe.each(TIME_ZONES)("gravação dupla das datas de contas - empresa em %s", (tz) => {
  it("criar e editar conta (vencimento e emissão, com e sem emissão), e cancelar", async () => {
    const { businessId } = await newBusiness(tz);
    const created = await createBill(businessId, "PAYABLE", {
      categoryId: expenseCategoryId, description: "Conta", amount: 30, dueDate: new Date("2026-10-20"), issueDate: new Date("2026-10-01"),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    let { bills } = await assertBillsInvariant(businessId, tz);
    expect(keyOrNull(bills[0].issueOn)).not.toBeNull();

    const updated = await updateBill(businessId, created.value.id, "PAYABLE", {
      categoryId: expenseCategoryId, description: "Conta editada", amount: 30, dueDate: EARLY_JST, issueDate: null,
    });
    expect(updated.ok).toBe(true);
    ({ bills } = await assertBillsInvariant(businessId, tz));
    expect(bills[0].issueOn).toBeNull();
    expect(dbDateToKey(bills[0].dueOn)).toBe(tz === "Asia/Tokyo" ? "2026-10-27" : "2026-10-26");

    expect((await cancelBill(businessId, created.value.id)).ok).toBe(true);
    await assertBillsInvariant(businessId, tz);
  });

  it("liquidar com data informada → reverter → liquidar de novo sem data (madrugada JST)", async () => {
    const { userId, businessId } = await newBusiness(tz);
    const bill = await createBill(businessId, "PAYABLE", { categoryId: expenseCategoryId, description: "Conta", amount: 30, dueDate: new Date("2026-10-15") });
    expect(bill.ok).toBe(true);
    if (!bill.ok) return;

    // como a rota faz com "paidAt": "2026-10-20"
    expect((await settleBill(businessId, userId, bill.value.id, new Date("2026-10-20"), "2026-10-20")).ok).toBe(true);
    let { bills } = await assertBillsInvariant(businessId, tz);
    expect(bills[0].paidOn).not.toBeNull();

    expect((await revertBillSettlement(businessId, bill.value.id)).ok).toBe(true);
    ({ bills } = await assertBillsInvariant(businessId, tz));
    expect(bills[0].status).toBe("PENDING");
    expect(bills[0].paidAt).toBeNull();
    expect(bills[0].paidOn).toBeNull();

    // sem data: o instante do clique (05:30 JST)
    expect((await settleBill(businessId, userId, bill.value.id, EARLY_JST)).ok).toBe(true);
    ({ bills } = await assertBillsInvariant(businessId, tz));
    expect(dbDateToKey(bills[0].paidOn!)).toBe(tz === "Asia/Tokyo" ? "2026-10-27" : "2026-10-26");
  });

  it("criar e editar conta recorrente (início e fim) e materializar (createMany)", async () => {
    const { businessId } = await newBusiness(tz);
    const mold = await createRecurringBill(businessId, "PAYABLE", {
      categoryId: expenseCategoryId, description: "Aluguel", amount: 1000, frequency: "MONTHLY", dayOfMonth: 5, startDate: new Date("2026-08-01"),
    });
    expect(mold.ok).toBe(true);
    if (!mold.ok) return;
    let { molds } = await assertBillsInvariant(businessId, tz);
    expect(molds[0].endOn).toBeNull();

    const updated = await updateRecurringBill(businessId, mold.value.id, "PAYABLE", {
      categoryId: expenseCategoryId, description: "Aluguel", amount: 1000, frequency: "MONTHLY", dayOfMonth: 5,
      startDate: startOfDayInstant("2026-08-01", tz), endDate: EARLY_JST,
    });
    expect(updated.ok).toBe(true);
    ({ molds } = await assertBillsInvariant(businessId, tz));
    expect(molds[0].endOn).not.toBeNull();

    await materializeRecurringBills(businessId, clockFor({ timezone: tz }, EARLY_JST));
    const { bills } = await assertBillsInvariant(businessId, tz);
    expect(bills.map((b) => dbDateToKey(b.dueOn)).sort()).toEqual(["2026-08-05", "2026-09-05", "2026-10-05"]);
  });

  it("venda à vista e a prazo (parcelas)", async () => {
    const { userId, businessId } = await newBusiness(tz);
    const client = await prisma.client.create({ data: { businessId, name: "Cliente" } });
    const base = {
      status: "CONFIRMED" as const, clientId: client.id, categoryId: revenueCategoryId, saleDate: new Date("2026-06-10"),
      items: [{ description: "Item", quantity: 1, unitPrice: 600 }], discount: null, paymentMethod: "PIX", notes: null,
    };
    expect((await createSale(businessId, userId, { ...base, clientRequestId: randomUUID(), installments: [{ dueDate: new Date("2026-06-10"), amount: 600, paidNow: true }] })).ok).toBe(true);
    expect((await createSale(businessId, userId, {
      ...base, clientRequestId: randomUUID(),
      installments: [{ dueDate: new Date("2026-07-10"), amount: 300 }, { dueDate: EARLY_JST, amount: 300 }],
    })).ok).toBe(true);
    const { bills } = await assertBillsInvariant(businessId, tz);
    expect(bills).toHaveLength(3);
    expect(bills.filter((b) => b.paidOn !== null)).toHaveLength(1);
  });

  it("conclusão de agendamento à vista e a prazo", async () => {
    const { userId, businessId } = await newBusiness(tz);
    const client = await prisma.client.create({ data: { businessId, name: "Cliente Agenda" } });
    const service = await prisma.product.create({ data: { businessId, name: "Corte", type: "SERVICO", durationMinutes: 30, defaultPrice: new Prisma.Decimal(50) } });
    // Horarios diferentes: a Agenda recusa agendamentos sobrepostos.
    for (const [offsetHours, installments] of [
      [0, [{ dueDate: toDateKey(EARLY_JST, tz), amount: 50, paidNow: true }]],
      [2, [{ dueDate: "2026-11-01", amount: 25 }, { dueDate: "2026-12-01", amount: 25 }]],
    ] as const) {
      const appointment = await createAppointment(businessId, { clientId: client.id, startAt: new Date(EARLY_JST.getTime() + offsetHours * 3600_000), services: [{ productId: service.id }] });
      expect(appointment.ok).toBe(true);
      if (!appointment.ok) return;
      const done = await completeAppointment(businessId, userId, appointment.value.id, {
        categoryId: revenueCategoryId, items: [{ productId: service.id, description: "Corte", quantity: 1, unitPrice: 50 }], installments: [...installments],
      }, tz);
      expect(done.ok).toBe(true);
    }
    const { bills } = await assertBillsInvariant(businessId, tz);
    expect(bills).toHaveLength(3);
  });
});
