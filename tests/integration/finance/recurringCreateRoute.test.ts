import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/financeiro/recurring/route";
import { materializeRecurringEntries } from "@/lib/finance/recurring/materialize";
import { addDays, clockFor, dbDateToKey, todayKey } from "@/lib/time/zoned";

// POST /api/financeiro/recurring (criar recorrente a partir das abas): materializa
// na hora as ocorrencias ja devidas, devolve a primeira ocorrencia (para o aviso
// da aba quando ainda e futura) e a idempotencia da F5 impede duplicatas.
const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string } }));
vi.mock("@/lib/auth/cookies", () => ({ getCurrentUser: async () => session.user }));

const TZ = "Asia/Tokyo";
let userId: string;
let businessId: string;
let categoryId: string;
const today = todayKey(clockFor({ timezone: TZ }));
const dayOf = (key: string) => Number(key.slice(8, 10));

beforeAll(async () => {
  const user = await prisma.user.create({ data: { name: "Teste RecRoute", email: `recroute-${Date.now()}@example.com`, passwordHash: "x" } });
  userId = user.id;
  session.user = { id: user.id, name: user.name, email: user.email };
  businessId = (await prisma.business.create({ data: { userId, name: "Empresa RecRoute", currency: "BRL", timezone: TZ } })).id;
  categoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } })).id;
});

afterAll(async () => {
  await prisma.financialEntry.deleteMany({ where: { businessId } });
  await prisma.recurringEntry.deleteMany({ where: { businessId } });
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

async function create(startDate: string, description: string, extra: Record<string, unknown> = {}) {
  const res = await POST(
    new Request("http://test/api/financeiro/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "REVENUE", categoryId, description, amount: "100", frequency: "MONTHLY", dayOfMonth: dayOf(startDate), startDate, ...extra }),
    })
  );
  return { status: res.status, ...((await res.json()) as { id?: string; firstOn?: string | null; created?: number; createdFirstOn?: string | null; createdLastOn?: string | null; error?: string }) };
}

const entriesOf = (recurringEntryId: string) =>
  prisma.financialEntry.findMany({ where: { recurringEntryId }, orderBy: { occurredOn: "asc" } });

describe("POST /api/financeiro/recurring", () => {
  it("início hoje: materializa a ocorrência de hoje, devolve firstOn = hoje e created = 1", async () => {
    const res = await create(today, "Hoje");
    expect([res.status, res.firstOn, res.created]).toEqual([201, today, 1]);
    const entries = await entriesOf(res.id!);
    expect(entries.map((e) => [e.source, e.type, dbDateToKey(e.occurredOn)])).toEqual([["RECURRING", "REVENUE", today]]);
  });

  it("início no passado: materializa TODAS as ocorrências até hoje; firstOn é a primeira", async () => {
    const start = addDays(today, -75);
    const res = await create(start, "Passado");
    expect(res.status).toBe(201);
    expect(res.firstOn).toBe(start);
    const entries = await entriesOf(res.id!);
    expect(entries.length).toBe(res.created);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    // Contagem e intervalo do que foi criado (para o aviso "N lançamentos criados, de ... a ...").
    expect([res.createdFirstOn, res.createdLastOn]).toEqual([start, dbDateToKey(entries[entries.length - 1].occurredOn)]);
    expect(dbDateToKey(entries[0].occurredOn)).toBe(start);
    expect(entries.every((e) => dbDateToKey(e.occurredOn) <= today)).toBe(true);
  });

  it("início no futuro: nada é materializado e firstOn traz a data da primeira ocorrência", async () => {
    const start = addDays(today, 10);
    const res = await create(start, "Futuro");
    expect([res.status, res.firstOn, res.created, res.createdFirstOn, res.createdLastOn]).toEqual([201, start, 0, null, null]);
    expect(await entriesOf(res.id!)).toHaveLength(0);
  });

  it("idempotência (F5): materializar de novo (recarregar a página) não duplica nada", async () => {
    const res = await create(addDays(today, -40), "Idempotente");
    const before = await entriesOf(res.id!);
    expect(before.length).toBeGreaterThanOrEqual(1);
    expect((await materializeRecurringEntries(businessId, userId)).created).toBe(0);
    expect((await materializeRecurringEntries(businessId, userId)).created).toBe(0);
    expect(await entriesOf(res.id!)).toHaveLength(before.length);
  });

  it("regra do dia do mês inalterada: início hoje com dia do mês diferente adia a primeira para o mês seguinte", async () => {
    const otherDay = dayOf(today) === 1 ? 2 : 1;
    const res = await create(today, "Outro dia", { dayOfMonth: otherDay });
    expect(res.status).toBe(201);
    expect(res.firstOn! > today || dayOf(res.firstOn!) === otherDay).toBe(true);
    expect(Number(res.firstOn!.slice(8, 10))).toBe(otherDay);
  });

  it("fim do molde antes da primeira ocorrência: firstOn é null (nada será gerado)", async () => {
    const otherDay = dayOf(today) === 1 ? 2 : 1;
    const res = await create(today, "Fim antes", { dayOfMonth: otherDay, endDate: today });
    expect(res.status).toBe(201);
    expect([res.firstOn, res.created]).toEqual([null, 0]);
  });
});
