import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { PUT as putRead } from "@/app/api/insights/read/route";
import { getInsightsForBusiness } from "@/lib/insights/queries";
import { insightKey } from "@/lib/insights/reads";
import { processClock } from "../../helpers/processClock";
import { dbDateOfInstant } from "@/lib/time/zoned";

// PUT /api/insights/read: autenticada, Zod, sempre o usuario/empresa da sessao.
const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string } }));
vi.mock("@/lib/auth/cookies", () => ({ getCurrentUser: async () => session.user }));

const TZ = "Asia/Tokyo";
const userIds: string[] = [];
const businessIds: string[] = [];

async function newBusiness(name: string) {
  const [revenue] = await Promise.all([prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } })]);
  const user = await prisma.user.create({ data: { name, email: `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "x" } });
  const business = await prisma.business.create({ data: { userId: user.id, name, currency: "BRL", timezone: TZ } });
  userIds.push(user.id);
  businessIds.push(business.id);
  await prisma.financialEntry.createMany({
    data: [
      { businessId: business.id, userId: user.id, type: "REVENUE", categoryId: revenue.id, description: "Ago", amount: "1000", occurredOn: dbDateOfInstant(new Date(2026, 7, 10), TZ) },
      { businessId: business.id, userId: user.id, type: "REVENUE", categoryId: revenue.id, description: "Set", amount: "1500", occurredOn: dbDateOfInstant(new Date(2026, 8, 5), TZ) },
    ],
  });
  const insights = await getInsightsForBusiness(business.id, processClock(new Date(2026, 8, 15)));
  return { user, business, key: insightKey(insights[0].metric, insights[0].periodKey) };
}

const put = (body: unknown) =>
  putRead(new Request("http://test/api/insights/read", { method: "PUT", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const as = (user: { id: string; name: string; email: string } | null) => {
  session.user = user && { id: user.id, name: user.name, email: user.email };
};

afterAll(async () => {
  await prisma.insightRead.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.insight.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.financialEntry.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("PUT /api/insights/read", () => {
  it("sem sessão: 401 e nada é gravado", async () => {
    const a = await newBusiness("RouteAnon");
    as(null);
    expect((await put({ insightKey: a.key, read: true })).status).toBe(401);
    expect(await prisma.insightRead.count({ where: { businessId: a.business.id } })).toBe(0);
  });

  it("marca e desmarca (idempotente) para o usuário da sessão", async () => {
    const a = await newBusiness("RouteOk");
    as(a.user);
    for (const read of [true, true, false, false]) {
      const res = await put({ insightKey: a.key, read });
      expect([res.status, await res.json()]).toEqual([200, { insightKey: a.key, read }]);
    }
    expect(await prisma.insightRead.count({ where: { businessId: a.business.id } })).toBe(0);
    await put({ insightKey: a.key, read: true });
    const row = await prisma.insightRead.findFirstOrThrow({ where: { businessId: a.business.id } });
    expect([row.userId, row.insightKey]).toEqual([a.user.id, a.key]);
  });

  it.each([
    [{ insightKey: "lixo", read: true }],
    [{ insightKey: "revenue_growth:2026-13", read: true }],
    [{ read: true }],
    [{ insightKey: "revenue_growth:2026-09" }],
    [{ insightKey: "revenue_growth:2026-09", read: "sim" }],
    [{ insightKey: "revenue_growth:2026-09", read: true, userId: "outro" }],
    ["não é json"],
  ])("valida o corpo (Zod): %j -> 400", async (body) => {
    const a = await newBusiness("RouteBad");
    as(a.user);
    expect((await put(body)).status).toBe(400);
    expect(await prisma.insightRead.count({ where: { businessId: a.business.id } })).toBe(0);
  });

  it("chave de insight que não existe na empresa do usuário: 404 (e nada é gravado)", async () => {
    const a = await newBusiness("RouteNotFound");
    as(a.user);
    const res = await put({ insightKey: "client_inactivity:2020-01", read: true });
    expect(res.status).toBe(404);
    expect(await prisma.insightRead.count({ where: { businessId: a.business.id } })).toBe(0);
  });

  it("isolamento: o usuário B não marca nada na empresa de A (a chave de A só vale na empresa de B se existir lá)", async () => {
    const a = await newBusiness("RouteIsoA");
    const b = await newBusiness("RouteIsoB");
    as(b.user);
    await put({ insightKey: a.key, read: true }); // mesma chave existe na empresa de B => grava só para B
    expect(await prisma.insightRead.count({ where: { businessId: a.business.id } })).toBe(0);
    expect(await prisma.insightRead.count({ where: { businessId: b.business.id, userId: b.user.id } })).toBe(1);
  });
});
