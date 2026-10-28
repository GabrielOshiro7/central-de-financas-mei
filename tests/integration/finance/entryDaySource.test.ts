import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { POST as postTransaction } from "@/app/api/financeiro/transactions/route";
import { POST as postSettle } from "@/app/api/financeiro/bills/[id]/settle/route";
import { PATCH as patchOpeningBalance } from "@/app/api/business/opening-balance/route";
import { createBill } from "@/lib/finance/bills/mutations";
import { getDailySeriesForRange, getFinancialSummaryForRange, getMonthlySeriesForRange, listTransactions } from "@/lib/finance/queries";
import { getCurrentCashBalance } from "@/lib/finance/cash/queries";
import { dayRange, dbDateToKey, monthRange, startOfDayInstant, toDateKey } from "@/lib/time/zoned";

// Etapa F6a-2: o DIA digitado pelo usuario e a fonte da verdade
// (occurredOn / openingBalanceOn). As rotas sao chamadas de verdade (so a
// sessao e simulada): antes, "2026-10-20" virava new Date("2026-10-20") =
// 00:00 UTC, que para uma empresa em America/Sao_Paulo e 21:00 de 19/10 - o
// lancamento aparecia no dia 19. Este arquivo FALHA no codigo da F6a-1 para
// Sao Paulo e passa para Toquio/UTC (sem mudanca de dia).
const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string } }));
vi.mock("@/lib/auth/cookies", () => ({ getCurrentUser: async () => session.user }));

const TIME_ZONES = ["America/Sao_Paulo", "UTC", "Asia/Tokyo"] as const;
const created: { userId: string; businessId: string }[] = [];
let revenueCategoryId: string;
let expenseCategoryId: string;

async function login(timezone: string) {
  const user = await prisma.user.create({
    data: { name: "Teste F6a-2", email: `f6a2-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "x" },
  });
  const business = await prisma.business.create({ data: { userId: user.id, name: `Empresa F6a-2 ${timezone}`, currency: "BRL", timezone } });
  created.push({ userId: user.id, businessId: business.id });
  session.user = { id: user.id, name: user.name, email: user.email };
  return { userId: user.id, businessId: business.id };
}

function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

beforeAll(async () => {
  revenueCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } })).id;
  expenseCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "EXPENSE" } })).id;
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  const ids = created.map((c) => c.businessId);
  await prisma.financialEntry.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.bill.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: created.map((c) => c.userId) } } });
});

describe.each(TIME_ZONES)("dia digitado é a fonte do dia - empresa em %s", (tz) => {
  it('lançamento "2026-10-20" pela rota: occurredOn 20/10, e aparece no dia 20 na lista, na série diária, no resumo do dia e em outubro', async () => {
    const { businessId } = await login(tz);
    const res = await postTransaction(
      jsonRequest("http://test/api/financeiro/transactions", "POST", {
        type: "REVENUE", occurredAt: "2026-10-20", description: "Venda dia 20", categoryId: revenueCategoryId, amount: 100,
      })
    );
    expect(res.status).toBe(201);

    const row = await prisma.financialEntry.findFirstOrThrow({ where: { businessId } });
    expect(dbDateToKey(row.occurredOn)).toBe("2026-10-20");
    expect(toDateKey(row.occurredAt, tz)).toBe("2026-10-20"); // invariante
    expect(row.occurredAt.toISOString()).toBe(startOfDayInstant("2026-10-20", tz).toISOString());

    const october = monthRange(2026, 10, tz);
    const { items } = await listTransactions(businessId, { range: october, pageSize: 100 }, tz);
    expect(items.map((i) => dbDateToKey(i.occurredOn))).toEqual(["2026-10-20"]);

    const daily = await getDailySeriesForRange(businessId, october, tz);
    const withRevenue = daily.filter((p) => p.hasRevenueEntries).map((p) => p.label);
    expect(withRevenue).toEqual(["20/10"]);

    expect((await getFinancialSummaryForRange(businessId, dayRange("2026-10-20", tz), tz)).revenue.toNumber()).toBe(100);
    expect((await getFinancialSummaryForRange(businessId, dayRange("2026-10-19", tz), tz)).hasAnyEntries).toBe(false);

    const monthly = await getMonthlySeriesForRange(businessId, { start: monthRange(2026, 9, tz).start, end: monthRange(2026, 11, tz).end }, tz);
    expect(monthly.map((m) => `${m.label}:${m.revenue.toNumber()}`)).toEqual(["Set:0", "Out:100", "Nov:0"]);
  });

  it('liquidação com data informada "2026-10-20" pela rota: o lançamento da conta fica no dia 20', async () => {
    const { userId, businessId } = await login(tz);
    const bill = await createBill(businessId, "PAYABLE", { categoryId: expenseCategoryId, description: "Conta", amount: 30, dueDate: new Date("2026-10-15") });
    expect(bill.ok).toBe(true);
    if (!bill.ok) return;
    const res = await postSettle(jsonRequest(`http://test/api/financeiro/bills/${bill.value.id}/settle`, "POST", { paidAt: "2026-10-20" }), {
      params: Promise.resolve({ id: bill.value.id }),
    });
    expect(res.status).toBe(200);
    const entry = await prisma.financialEntry.findFirstOrThrow({ where: { businessId, billId: bill.value.id } });
    expect(dbDateToKey(entry.occurredOn)).toBe("2026-10-20");
    expect(toDateKey(entry.occurredAt, tz)).toBe("2026-10-20");
    expect(userId).toBeTruthy();
  });

  it('saldo inicial "2026-09-30" pela rota: openingBalanceOn 30/09, e o caixa usa esse dia', async () => {
    const { businessId } = await login(tz);
    const res = await patchOpeningBalance(
      jsonRequest("http://test/api/business/opening-balance", "PATCH", { openingBalance: 1000, openingBalanceDate: "2026-09-30" })
    );
    expect(res.status).toBe(200);
    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(dbDateToKey(business.openingBalanceOn!)).toBe("2026-09-30");
    expect(toDateKey(business.openingBalanceDate!, tz)).toBe("2026-09-30");
    const cash = await getCurrentCashBalance(businessId, business);
    expect(cash?.asOfDay).toBe("2026-09-30");
  });
});

describe("madrugada de Tóquio (00:00–09:00 JST)", () => {
  it("liquidação SEM data às 05:30 JST (20:30 UTC do dia anterior) cai no dia de Tóquio", async () => {
    const tz = "Asia/Tokyo";
    const { businessId } = await login(tz);
    const bill = await createBill(businessId, "PAYABLE", { categoryId: expenseCategoryId, description: "Conta", amount: 10, dueDate: new Date("2026-10-26") });
    expect(bill.ok).toBe(true);
    if (!bill.ok) return;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T20:30:00.000Z"));
    const res = await postSettle(jsonRequest(`http://test/api/financeiro/bills/${bill.value.id}/settle`, "POST", {}), {
      params: Promise.resolve({ id: bill.value.id }),
    });
    vi.useRealTimers();
    expect(res.status).toBe(200);
    const entry = await prisma.financialEntry.findFirstOrThrow({ where: { businessId, billId: bill.value.id } });
    expect(dbDateToKey(entry.occurredOn)).toBe("2026-10-27");
    expect(entry.occurredAt.toISOString()).toBe("2026-10-26T20:30:00.000Z"); // instante real, como antes
  });
});
