import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createTransaction, updateTransaction } from "@/lib/finance/mutations";
import { createBill, settleBill } from "@/lib/finance/bills/mutations";
import { confirmImport } from "@/lib/finance/importConfirm";
import { materializeRecurringEntries } from "@/lib/finance/recurring/materialize";
import { createSale } from "@/lib/sales/mutations";
import { createAppointment, completeAppointment } from "@/lib/agenda/mutations";
import { updateOpeningBalance } from "@/lib/finance/cash/mutations";
import { dbDateToKey, startOfDayInstant, toDateKey } from "@/lib/time/zoned";

// Etapa F6a-1 (expandir): todo caminho que grava FinancialEntry.occurredAt
// ou Business.openingBalanceDate grava TAMBEM a coluna nova de dia
// (occurredOn / openingBalanceOn) com o MESMO dia que o app enxerga no
// instante antigo: dbDateToKey(occurredOn) == toDateKey(occurredAt, fuso da
// empresa). Os caminhos sao exercitados pelo codigo real (mutations), como as
// rotas chamam - inclusive com o instante do jeito que cada rota monta hoje
// (new Date("YYYY-MM-DD") = 00:00 UTC; settle sem data = instante "agora").
const TIME_ZONES = ["Asia/Tokyo", "America/Sao_Paulo", "UTC"] as const;
// 05:30 JST de 27/10 = 20:30 UTC de 26/10 = 17:30 de 26/10 em Sao Paulo.
const EARLY_JST = new Date("2026-10-26T20:30:00.000Z");

const created: { userId: string; businessId: string }[] = [];
let revenueCategoryId: string;
let expenseCategoryId: string;

async function newBusiness(timezone: string) {
  const user = await prisma.user.create({
    data: { name: "Teste F6a-1", email: `f6a1-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "x" },
  });
  const business = await prisma.business.create({ data: { userId: user.id, name: `Empresa F6a-1 ${timezone}`, currency: "BRL", timezone } });
  created.push({ userId: user.id, businessId: business.id });
  return { userId: user.id, businessId: business.id };
}

// Invariante sobre TODAS as linhas da empresa; devolve o que foi conferido.
async function assertEntriesInvariant(businessId: string, timeZone: string) {
  const rows = await prisma.financialEntry.findMany({ where: { businessId }, orderBy: { createdAt: "asc" } });
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(dbDateToKey(row.occurredOn), `${row.source} ${row.occurredAt.toISOString()} (${timeZone})`).toBe(
      toDateKey(row.occurredAt, timeZone)
    );
  }
  return rows.map((r) => ({ source: r.source, at: r.occurredAt.toISOString(), on: dbDateToKey(r.occurredOn) }));
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
  await prisma.recurringEntry.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.product.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.client.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.category.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: created.map((c) => c.userId) } } });
});

describe.each(TIME_ZONES)("gravação dupla occurredAt + occurredOn - empresa em %s", (tz) => {
  it("lançamento manual: criar (00:00 UTC, como a rota grava) e editar (para a madrugada JST)", async () => {
    const { userId, businessId } = await newBusiness(tz);
    const result = await createTransaction(businessId, userId, {
      type: "REVENUE", occurredAt: new Date("2026-10-20"), description: "Manual", categoryId: revenueCategoryId, amount: 100,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const afterCreate = await assertEntriesInvariant(businessId, tz);
    // Tóquio e UTC: 20/10; São Paulo: 00:00 UTC de 20/10 = 21:00 de 19/10 (mesmo dia que a tela mostra hoje).
    expect(afterCreate[0].on).toBe(tz === "America/Sao_Paulo" ? "2026-10-19" : "2026-10-20");

    const updated = await updateTransaction(businessId, result.value.id, {
      type: "REVENUE", occurredAt: EARLY_JST, description: "Manual editado", categoryId: revenueCategoryId, amount: 100,
    });
    expect(updated.ok).toBe(true);
    const afterUpdate = await assertEntriesInvariant(businessId, tz);
    expect(afterUpdate[0].on).toBe(tz === "Asia/Tokyo" ? "2026-10-27" : "2026-10-26");
  });

  it("liquidação de conta (settle) com hora no meio do dia e na madrugada JST", async () => {
    const { userId, businessId } = await newBusiness(tz);
    for (const paidAt of [new Date("2026-09-14T01:17:04.558Z"), EARLY_JST]) {
      const bill = await createBill(businessId, "PAYABLE", {
        categoryId: expenseCategoryId, description: "Conta", amount: 30, dueDate: new Date("2026-09-04"),
      });
      expect(bill.ok).toBe(true);
      if (!bill.ok) return;
      const settled = await settleBill(businessId, userId, bill.value.id, paidAt);
      expect(settled.ok).toBe(true);
    }
    const rows = await assertEntriesInvariant(businessId, tz);
    expect(rows.map((r) => r.source)).toEqual(["BILL", "BILL"]);
  });

  it("importação (00:00 do dia da planilha no fuso da empresa)", async () => {
    const { userId, businessId } = await newBusiness(tz);
    const result = await confirmImport(businessId, userId, "BRL", tz, [
      { rowNumber: 2, data: "2026-10-20", tipo: "receita", categoria: "Venda de produtos", descricao: "Import", valor: "500", observacao: "" },
    ], "import_anyway");
    expect(result.inserted).toBe(1);
    const rows = await assertEntriesInvariant(businessId, tz);
    expect(rows[0].on).toBe("2026-10-20");
  });

  it("materialização de recorrentes (createMany), inclusive com 'agora' na madrugada JST", async () => {
    const { userId, businessId } = await newBusiness(tz);
    await prisma.recurringEntry.create({
      data: {
        businessId, type: "EXPENSE", categoryId: expenseCategoryId, amount: new Prisma.Decimal(10), description: "Mensal",
        frequency: "MONTHLY", dayOfMonth: 1, startDate: startOfDayInstant("2026-08-01", tz),
      },
    });
    await materializeRecurringEntries(businessId, userId, EARLY_JST);
    const rows = await assertEntriesInvariant(businessId, tz);
    expect(rows.map((r) => r.on).sort()).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
  });

  it("venda à vista (parcela paga na criação)", async () => {
    const { userId, businessId } = await newBusiness(tz);
    const client = await prisma.client.create({ data: { businessId, name: "Cliente" } });
    const result = await createSale(businessId, userId, {
      clientRequestId: randomUUID(), status: "CONFIRMED", clientId: client.id, categoryId: revenueCategoryId,
      saleDate: new Date("2026-06-10"), items: [{ description: "Item", quantity: 1, unitPrice: 500 }], discount: null,
      paymentMethod: "PIX", installments: [{ dueDate: new Date("2026-06-10"), amount: 500, paidNow: true }], notes: null,
    });
    expect(result.ok).toBe(true);
    await assertEntriesInvariant(businessId, tz);
  });

  it("conclusão de agendamento à vista (passa pelo mesmo caminho de venda)", async () => {
    const { userId, businessId } = await newBusiness(tz);
    const client = await prisma.client.create({ data: { businessId, name: "Cliente Agenda" } });
    const service = await prisma.product.create({
      data: { businessId, name: "Corte", type: "SERVICO", durationMinutes: 30, defaultPrice: new Prisma.Decimal(50) },
    });
    const appointment = await createAppointment(businessId, { clientId: client.id, startAt: EARLY_JST, services: [{ productId: service.id }] });
    expect(appointment.ok).toBe(true);
    if (!appointment.ok) return;
    const day = toDateKey(EARLY_JST, tz);
    const completed = await completeAppointment(businessId, userId, appointment.value.id, {
      categoryId: revenueCategoryId,
      items: [{ productId: service.id, description: "Corte", quantity: 1, unitPrice: 50 }],
      installments: [{ dueDate: day, amount: 50, paidNow: true }],
    }, tz);
    expect(completed.ok).toBe(true);
    const rows = await assertEntriesInvariant(businessId, tz);
    // Tóquio/UTC: o dia do atendimento. São Paulo: a venda grava saleDate/paidAt
    // como new Date("YYYY-MM-DD") (00:00 UTC = 21:00 do dia anterior em SP) -
    // comportamento atual de Sale/Bill, que muda só na F6b/F6c; a coluna nova
    // reproduz fielmente o mesmo dia que o app já mostra hoje.
    expect(rows[0].on).toBe(tz === "America/Sao_Paulo" ? "2026-10-25" : day);
  });

  it("saldo inicial (Configurações): openingBalanceOn = dia de openingBalanceDate", async () => {
    const { userId, businessId } = await newBusiness(tz);
    for (const openingBalanceDate of [new Date("2026-09-30"), EARLY_JST]) {
      const result = await updateOpeningBalance(userId, { openingBalance: 1000, openingBalanceDate });
      expect(result.ok).toBe(true);
      const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
      expect(dbDateToKey(business.openingBalanceOn!)).toBe(toDateKey(business.openingBalanceDate!, tz));
    }
  });
});
