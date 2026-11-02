import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { POST as postSale } from "@/app/api/vendas/route";
import { POST as postRecurring } from "@/app/api/financeiro/recurring/route";
import { createAppointment, completeAppointment } from "@/lib/agenda/mutations";
import { materializeRecurringEntries } from "@/lib/finance/recurring/materialize";
import { getSalesSummary } from "@/lib/sales/queries";
import { dayRange, dbDateToKey, startOfDayInstant, toDateKey, zonedInstant } from "@/lib/time/zoned";

// Etapa F6c: o DIA digitado e a fonte da verdade de vendas (saleOn), das
// parcelas que a venda gera (dueOn/paidOn), do lancamento a vista
// (occurredOn) e dos moldes de lancamento recorrente (startOn/endOn). As
// rotas sao chamadas de verdade (so a sessao e simulada). Antes,
// "2026-10-20" virava new Date("2026-10-20") = 00:00 UTC, que em
// America/Sao_Paulo e 21:00 de 19/10: a venda, a parcela a vista e o
// lancamento caiam no dia 19, e o molde comecava/terminava um dia antes.
// Os testes "dia da venda/parcelas/lancamento", "conclusão de agendamento" e
// "molde recorrente" usam so colunas que ja existiam antes da F6c (saleDate
// lido no fuso, dueOn/paidOn, occurredOn) e FALHAM no codigo anterior para
// Sao Paulo; Toquio/UTC nao mudam de dia.
const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string } }));
vi.mock("@/lib/auth/cookies", () => ({ getCurrentUser: async () => session.user }));

const TIME_ZONES = ["America/Sao_Paulo", "UTC", "Asia/Tokyo"] as const;
const created: { userId: string; businessId: string }[] = [];
let revenueCategoryId: string;
let expenseCategoryId: string;

async function login(timezone: string) {
  const user = await prisma.user.create({
    data: { name: "Teste F6c", email: `f6c-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "x" },
  });
  const business = await prisma.business.create({ data: { userId: user.id, name: `Empresa F6c ${timezone}`, currency: "BRL", timezone } });
  created.push({ userId: user.id, businessId: business.id });
  session.user = { id: user.id, name: user.name, email: user.email };
  const client = await prisma.client.create({ data: { businessId: business.id, name: "Cliente F6c" } });
  return { userId: user.id, businessId: business.id, clientId: client.id };
}

function jsonRequest(url: string, body: unknown) {
  return new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

async function postSaleByRoute(clientId: string, installments: unknown[]) {
  const res = await postSale(
    jsonRequest("http://test/api/vendas", {
      clientRequestId: randomUUID(), status: "CONFIRMED", clientId, categoryId: revenueCategoryId, saleDate: "2026-10-20",
      items: [{ description: "Item", quantity: 1, unitPrice: 300 }], paymentMethod: "PIX", installments,
    })
  );
  expect(res.status).toBe(201);
  const { id } = (await res.json()) as { id: string };
  return prisma.sale.findUniqueOrThrow({ where: { id }, include: { bills: { orderBy: { dueOn: "asc" } } } });
}

// Gravacao dupla: as colunas antigas sao 00:00 do MESMO dia no fuso da empresa
// (vendas, moldes, contas e lancamentos), e paidOn/paidAt NULL juntos.
async function assertDualWriteInvariants(businessId: string, tz: string) {
  const sales = await prisma.sale.findMany({ where: { businessId } });
  for (const s of sales) {
    expect(s.saleDate.toISOString(), `venda #${s.saleNumber}`).toBe(startOfDayInstant(dbDateToKey(s.saleOn), tz).toISOString());
  }
  const molds = await prisma.recurringEntry.findMany({ where: { businessId } });
  for (const m of molds) {
    expect(m.startDate.toISOString(), m.description).toBe(startOfDayInstant(dbDateToKey(m.startOn), tz).toISOString());
    expect(m.endDate?.toISOString() ?? null, m.description).toBe(m.endOn ? startOfDayInstant(dbDateToKey(m.endOn), tz).toISOString() : null);
  }
  const bills = await prisma.bill.findMany({ where: { businessId } });
  for (const b of bills) {
    expect(b.dueDate.toISOString(), b.description).toBe(startOfDayInstant(dbDateToKey(b.dueOn), tz).toISOString());
    expect(b.paidOn === null, `${b.description} paidOn/paidAt`).toBe(b.paidAt === null);
  }
  const entries = await prisma.financialEntry.findMany({ where: { businessId } });
  for (const e of entries) expect(toDateKey(e.occurredAt, tz), e.description).toBe(dbDateToKey(e.occurredOn));
  return { sales, molds, bills, entries };
}

beforeAll(async () => {
  revenueCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE", name: "Venda de produtos" } })).id;
  expenseCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "EXPENSE" } })).id;
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  const ids = created.map((c) => c.businessId);
  await prisma.appointmentService.deleteMany({ where: { appointment: { businessId: { in: ids } } } });
  await prisma.appointment.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.financialEntry.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.bill.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.saleItem.deleteMany({ where: { sale: { businessId: { in: ids } } } });
  await prisma.sale.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.recurringEntry.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.product.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.client.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: created.map((c) => c.userId) } } });
});

describe.each(TIME_ZONES)("dia digitado é a fonte do dia de vendas e recorrentes - empresa em %s", (tz) => {
  it('venda "2026-10-20" a prazo: venda em 20/10, parcelas nos dias digitados, no resumo do dia 20 (e não do 19)', async () => {
    const { businessId, clientId } = await login(tz);
    const sale = await postSaleByRoute(clientId, [
      { dueDate: "2026-11-20", amount: 150 },
      { dueDate: "2026-12-20", amount: 150 },
    ]);
    expect(toDateKey(sale.saleDate, tz)).toBe("2026-10-20");
    expect(sale.bills.map((b) => dbDateToKey(b.dueOn))).toEqual(["2026-11-20", "2026-12-20"]);
    const clock = { timeZone: tz, now: zonedInstant(tz, 2026, 10, 21, 12, 0) };
    expect((await getSalesSummary(businessId, dayRange("2026-10-20", tz), clock)).salesCount).toBe(1);
    expect((await getSalesSummary(businessId, dayRange("2026-10-19", tz), clock)).salesCount).toBe(0);
  });

  it('venda à vista "2026-10-20" registrada em 22/10: parcela paga no dia 20, lançamento no dia 20, paidAt = instante do registro', async () => {
    const { businessId, clientId } = await login(tz);
    const registeredAt = zonedInstant(tz, 2026, 10, 22, 10, 0);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(registeredAt);
    const sale = await postSaleByRoute(clientId, [{ dueDate: "2026-10-20", amount: 300, paidNow: true }]);
    vi.useRealTimers();
    const [bill] = sale.bills;
    expect(dbDateToKey(bill.dueOn)).toBe("2026-10-20");
    expect(dbDateToKey(bill.paidOn!)).toBe("2026-10-20");
    const entry = await prisma.financialEntry.findFirstOrThrow({ where: { businessId, billId: bill.id } });
    expect(dbDateToKey(entry.occurredOn)).toBe("2026-10-20");
    expect(entry.occurredAt.toISOString()).toBe(startOfDayInstant("2026-10-20", tz).toISOString());
    // Auditoria (decisao da F6b-2): o instante real do registro.
    expect(bill.paidAt!.toISOString()).toBe(registeredAt.toISOString());
  });

  it("conclusão de agendamento de 20/10 às 23:30 (no fuso da empresa): venda, parcela à vista e lançamento em 20/10", async () => {
    const { userId, businessId, clientId } = await login(tz);
    const service = await prisma.product.create({ data: { businessId, name: "Corte", type: "SERVICO", durationMinutes: 30, defaultPrice: new Prisma.Decimal(50) } });
    const appointment = await createAppointment(businessId, { clientId, startAt: zonedInstant(tz, 2026, 10, 20, 23, 30), services: [{ productId: service.id }] });
    expect(appointment.ok).toBe(true);
    if (!appointment.ok) return;
    const done = await completeAppointment(businessId, userId, appointment.value.id, {
      categoryId: revenueCategoryId, items: [{ productId: service.id, description: "Corte", quantity: 1, unitPrice: 50 }],
      installments: [{ dueDate: "2026-10-25", amount: 50, paidNow: true }],
    }, tz);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: done.value.saleId }, include: { bills: true } });
    expect(toDateKey(sale.saleDate, tz)).toBe("2026-10-20");
    expect(dbDateToKey(sale.bills[0].dueOn)).toBe("2026-10-20"); // a vista: o dia do atendimento, nao o digitado
    expect(dbDateToKey(sale.bills[0].paidOn!)).toBe("2026-10-20");
    const entry = await prisma.financialEntry.findFirstOrThrow({ where: { businessId, billId: sale.bills[0].id } });
    expect(dbDateToKey(entry.occurredOn)).toBe("2026-10-20");
  });

  it('molde recorrente "2026-10-20" a "2026-12-20" (mensal, dia 20): ocorrências em 20/10, 20/11 e 20/12', async () => {
    const { userId, businessId } = await login(tz);
    const res = await postRecurring(
      jsonRequest("http://test/api/financeiro/recurring", {
        type: "EXPENSE", categoryId: expenseCategoryId, description: "Aluguel", amount: 1000,
        frequency: "MONTHLY", dayOfMonth: 20, startDate: "2026-10-20", endDate: "2026-12-20",
      })
    );
    expect(res.status).toBe(201);
    await materializeRecurringEntries(businessId, userId, zonedInstant(tz, 2027, 1, 15, 12, 0));
    const entries = await prisma.financialEntry.findMany({ where: { businessId, source: "RECURRING" } });
    expect(entries.map((e) => dbDateToKey(e.occurredOn)).sort()).toEqual(["2026-10-20", "2026-11-20", "2026-12-20"]);
    const mold = await prisma.recurringEntry.findFirstOrThrow({ where: { businessId } });
    expect(toDateKey(mold.startDate, tz)).toBe("2026-10-20");
    expect(toDateKey(mold.endDate!, tz)).toBe("2026-12-20");
  });

  it("gravação dupla: saleOn/startOn/endOn são os dias digitados e as colunas antigas = 00:00 desses dias, em todos os caminhos", async () => {
    const { userId, businessId, clientId } = await login(tz);
    await postSaleByRoute(clientId, [{ dueDate: "2026-11-20", amount: 300 }]);
    await postSaleByRoute(clientId, [{ dueDate: "2026-10-20", amount: 300, paidNow: true }]);
    await postRecurring(
      jsonRequest("http://test/api/financeiro/recurring", {
        type: "EXPENSE", categoryId: expenseCategoryId, description: "Mensal", amount: 10, frequency: "MONTHLY", dayOfMonth: 1,
        startDate: "2026-08-01", endDate: "2026-09-30",
      })
    );
    const service = await prisma.product.create({ data: { businessId, name: "Barba", type: "SERVICO", durationMinutes: 30, defaultPrice: new Prisma.Decimal(30) } });
    const appointment = await createAppointment(businessId, { clientId, startAt: zonedInstant(tz, 2026, 10, 20, 0, 15), services: [{ productId: service.id }] });
    if (!appointment.ok) throw new Error(appointment.error);
    const done = await completeAppointment(businessId, userId, appointment.value.id, {
      categoryId: revenueCategoryId, items: [{ productId: service.id, description: "Barba", quantity: 1, unitPrice: 30 }],
      installments: [{ dueDate: "2026-11-05", amount: 15 }, { dueDate: "2026-12-05", amount: 15 }],
    }, tz);
    expect(done.ok).toBe(true);

    const { sales, molds } = await assertDualWriteInvariants(businessId, tz);
    expect(sales.map((s) => dbDateToKey(s.saleOn))).toEqual(["2026-10-20", "2026-10-20", "2026-10-20"]);
    expect(dbDateToKey(molds[0].startOn)).toBe("2026-08-01");
    expect(dbDateToKey(molds[0].endOn!)).toBe("2026-09-30");
  });
});
