import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST as postBill } from "@/app/api/financeiro/bills/route";
import { POST as postSettle } from "@/app/api/financeiro/bills/[id]/settle/route";
import { POST as postRevert } from "@/app/api/financeiro/bills/[id]/revert/route";
import { POST as postRecurring } from "@/app/api/financeiro/bills/recurring/route";
import { deriveBillStatus } from "@/lib/finance/bills/status";
import { getBillSummary, getOverdueAmountForDueRange, listBills } from "@/lib/finance/bills/queries";
import { clockFor, dayRange, dbDateToKey, formatDateKey, monthRange, startOfDayInstant, toDateKey, zonedInstant } from "@/lib/time/zoned";

// Etapa F6b-2: o DIA digitado e a fonte da verdade das contas (dueOn/issueOn/
// paidOn/startOn/endOn). As rotas sao chamadas de verdade (so a sessao e
// simulada) e os leitores sao os do app. Antes, "2026-10-20" virava
// new Date("2026-10-20") = 00:00 UTC, que para uma empresa em
// America/Sao_Paulo e 21:00 de 19/10: a conta vencia no dia 19, aparecia
// vencida em 00:30 do dia 20 e o pagamento informado "2026-10-19" ia para o
// dia 18. Este arquivo FALHA no codigo da F6b-1 para Sao Paulo e passa para
// Toquio/UTC (sem mudanca de dia).
const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string } }));
vi.mock("@/lib/auth/cookies", () => ({ getCurrentUser: async () => session.user }));

const TIME_ZONES = ["America/Sao_Paulo", "UTC", "Asia/Tokyo"] as const;
const created: { userId: string; businessId: string }[] = [];
let expenseCategoryId: string;

async function login(timezone: string) {
  const user = await prisma.user.create({
    data: { name: "Teste F6b-2", email: `f6b2-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "x" },
  });
  const business = await prisma.business.create({ data: { userId: user.id, name: `Empresa F6b-2 ${timezone}`, currency: "BRL", timezone } });
  created.push({ userId: user.id, businessId: business.id });
  session.user = { id: user.id, name: user.name, email: user.email };
  return { userId: user.id, businessId: business.id };
}

function jsonRequest(url: string, body: unknown) {
  return new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function createBillByRoute(body: Record<string, unknown>) {
  const res = await postBill(
    jsonRequest("http://test/api/financeiro/bills", { direction: "PAYABLE", categoryId: expenseCategoryId, description: "Conta", amount: 30, ...body })
  );
  expect(res.status).toBe(201);
  const { id } = (await res.json()) as { id: string };
  return prisma.bill.findUniqueOrThrow({ where: { id } });
}

beforeAll(async () => {
  expenseCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "EXPENSE" } })).id;
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  const ids = created.map((c) => c.businessId);
  await prisma.financialEntry.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.bill.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.recurringBill.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: created.map((c) => c.userId) } } });
});

describe.each(TIME_ZONES)("dia digitado é a fonte do dia das contas - empresa em %s", (tz) => {
  it('vencimento "2026-10-20": dia 20, pendente às 00:30 do dia 20, vencida às 00:30 do dia 21, e em outubro', async () => {
    const { businessId } = await login(tz);
    const bill = await createBillByRoute({ dueDate: "2026-10-20", issueDate: "2026-10-01" });

    expect(dbDateToKey(bill.dueOn)).toBe("2026-10-20");
    expect(formatDateKey(dbDateToKey(bill.dueOn))).toBe("20/10/2026"); // exibicao (BillListPage)
    expect(dbDateToKey(bill.issueOn!)).toBe("2026-10-01");
    // gravacao dupla: a coluna antiga e 00:00 do mesmo dia no fuso da empresa
    expect(bill.dueDate.toISOString()).toBe(startOfDayInstant("2026-10-20", tz).toISOString());
    expect(toDateKey(bill.issueDate!, tz)).toBe("2026-10-01");

    const day20 = clockFor({ timezone: tz }, zonedInstant(tz, 2026, 10, 20, 0, 30));
    const day21 = clockFor({ timezone: tz }, zonedInstant(tz, 2026, 10, 21, 0, 30));
    expect(deriveBillStatus(bill, day20)).toBe("PENDING");
    expect(deriveBillStatus(bill, day21)).toBe("OVERDUE");

    const ids = async (status: "PENDING" | "OVERDUE", clock: typeof day20) =>
      (await listBills(businessId, { direction: "PAYABLE", displayStatus: status }, clock)).items.map((b) => b.id);
    expect(await ids("PENDING", day20)).toEqual([bill.id]);
    expect(await ids("OVERDUE", day20)).toEqual([]);
    expect(await ids("PENDING", day21)).toEqual([]);
    expect(await ids("OVERDUE", day21)).toEqual([bill.id]);

    const empty = dayRange("2026-10-20", tz);
    const summary20 = await getBillSummary(businessId, "PAYABLE", empty, day20);
    expect(summary20.dueTodayCount).toBe(1);
    expect(summary20.totalOverdueAmount.toNumber()).toBe(0);
    const summary21 = await getBillSummary(businessId, "PAYABLE", empty, day21);
    expect(summary21.dueTodayCount).toBe(0);
    expect(summary21.totalOverdueAmount.toNumber()).toBe(30);

    const october = monthRange(2026, 10, tz);
    const september = monthRange(2026, 9, tz);
    expect((await listBills(businessId, { direction: "PAYABLE", dueRange: october }, day20)).items.map((b) => b.id)).toEqual([bill.id]);
    expect((await listBills(businessId, { direction: "PAYABLE", dueRange: dayRange("2026-10-19", tz) }, day20)).items).toEqual([]);
    expect((await getOverdueAmountForDueRange(businessId, "PAYABLE", october, day21)).toNumber()).toBe(30);
    expect((await getOverdueAmountForDueRange(businessId, "PAYABLE", september, day21)).toNumber()).toBe(0);
  });

  it('pagamento informado "2026-10-19" registrado em 20/10: paidOn 19/10, paidAt = instante do registro, lançamento em 19/10; reverter zera os dois', async () => {
    const { businessId } = await login(tz);
    const bill = await createBillByRoute({ dueDate: "2026-10-15" });

    const registeredAt = zonedInstant(tz, 2026, 10, 20, 14, 5);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(registeredAt);
    const res = await postSettle(jsonRequest(`http://test/api/financeiro/bills/${bill.id}/settle`, { paidAt: "2026-10-19" }), params(bill.id));
    vi.useRealTimers();
    expect(res.status).toBe(200);

    const paid = await prisma.bill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(dbDateToKey(paid.paidOn!)).toBe("2026-10-19");
    expect(paid.paidAt!.toISOString()).toBe(registeredAt.toISOString()); // auditoria: o instante real
    const entry = await prisma.financialEntry.findFirstOrThrow({ where: { businessId, billId: bill.id } });
    expect(dbDateToKey(entry.occurredOn)).toBe("2026-10-19");
    expect(entry.occurredAt.toISOString()).toBe(startOfDayInstant("2026-10-19", tz).toISOString());

    const clock = clockFor({ timezone: tz }, registeredAt);
    expect((await getBillSummary(businessId, "PAYABLE", dayRange("2026-10-19", tz), clock)).totalPaidAmount.toNumber()).toBe(30);
    expect((await getBillSummary(businessId, "PAYABLE", dayRange("2026-10-20", tz), clock)).totalPaidAmount.toNumber()).toBe(0);
    expect((await getBillSummary(businessId, "PAYABLE", monthRange(2026, 10, tz), clock)).totalPaidAmount.toNumber()).toBe(30);

    expect((await postRevert(jsonRequest(`http://test/api/financeiro/bills/${bill.id}/revert`, {}), params(bill.id))).status).toBe(200);
    const reverted = await prisma.bill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(reverted.status).toBe("PENDING");
    expect(reverted.paidOn).toBeNull();
    expect(reverted.paidAt).toBeNull();
    expect(await prisma.financialEntry.count({ where: { billId: bill.id } })).toBe(0);
  });

  it('conta recorrente de "2026-10-20" a "2026-12-20" (mensal, dia 20): início/fim são esses dias e as ocorrências incluem 20/12', async () => {
    const { businessId } = await login(tz);
    const res = await postRecurring(
      jsonRequest("http://test/api/financeiro/bills/recurring", {
        direction: "PAYABLE", categoryId: expenseCategoryId, description: "Aluguel", amount: 1000,
        frequency: "MONTHLY", dayOfMonth: 20, startDate: "2026-10-20", endDate: "2026-12-20",
      })
    );
    expect(res.status).toBe(201);
    const mold = await prisma.recurringBill.findFirstOrThrow({ where: { businessId } });
    expect(dbDateToKey(mold.startOn)).toBe("2026-10-20");
    expect(dbDateToKey(mold.endOn!)).toBe("2026-12-20");
    expect(mold.startDate.toISOString()).toBe(startOfDayInstant("2026-10-20", tz).toISOString());
    // a rota materializa com o relogio real (horizonte de 90 dias, alem de 20/12)
    const bills = await prisma.bill.findMany({ where: { businessId }, orderBy: { dueOn: "asc" } });
    expect(bills.map((b) => dbDateToKey(b.dueOn))).toEqual(["2026-10-20", "2026-11-20", "2026-12-20"]);
  });
});

describe("liquidação sem data na madrugada de Tóquio (00:30 JST = 15:30 UTC do dia anterior)", () => {
  it.each([
    ["Asia/Tokyo", "2026-10-27"],
    ["UTC", "2026-10-26"],
  ])("empresa em %s: paidOn = o dia da empresa (%s), paidAt = o instante do clique", async (tz, expectedDay) => {
    const { businessId } = await login(tz);
    const bill = await createBillByRoute({ dueDate: "2026-10-26" });
    const click = new Date("2026-10-26T15:30:00.000Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(click);
    const res = await postSettle(jsonRequest(`http://test/api/financeiro/bills/${bill.id}/settle`, {}), params(bill.id));
    vi.useRealTimers();
    expect(res.status).toBe(200);

    const paid = await prisma.bill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(dbDateToKey(paid.paidOn!)).toBe(expectedDay);
    expect(paid.paidAt!.toISOString()).toBe(click.toISOString());
    const entry = await prisma.financialEntry.findFirstOrThrow({ where: { businessId, billId: bill.id } });
    expect(dbDateToKey(entry.occurredOn)).toBe(expectedDay);
    expect(entry.occurredAt.toISOString()).toBe(startOfDayInstant(expectedDay, tz).toISOString());
  });
});
