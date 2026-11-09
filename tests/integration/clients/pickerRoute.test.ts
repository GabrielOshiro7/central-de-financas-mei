import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "@/app/api/clientes/search/route";

// GET /api/clientes/search: sessao obrigatoria, empresa SEMPRE da sessao.
const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string } }));
vi.mock("@/lib/auth/cookies", () => ({ getCurrentUser: async () => session.user }));

const createdUserIds: string[] = [];

async function login(label: string) {
  const user = await prisma.user.create({
    data: { name: `Teste Rota ${label}`, email: `picker-route-${label}-${Date.now()}@example.com`, passwordHash: "x" },
  });
  createdUserIds.push(user.id);
  const business = await prisma.business.create({ data: { userId: user.id, name: `Empresa ${label}`, currency: "BRL" } });
  session.user = { id: user.id, name: user.name, email: user.email };
  return business.id;
}

const get = async (query = "") => {
  const res = await GET(new Request(`http://test/api/clientes/search${query}`));
  return { status: res.status, body: (await res.json()) as { mode?: string; clients?: { name: string }[]; error?: string } };
};

afterAll(async () => {
  const businesses = await prisma.business.findMany({ where: { userId: { in: createdUserIds } }, select: { id: true } });
  const ids = businesses.map((b) => b.id);
  await prisma.client.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("GET /api/clientes/search", () => {
  it("sem sessao: 401", async () => {
    session.user = null;
    expect((await get()).status).toBe(401);
  });

  it("sem q (ou vazio): modo recentes; com q: modo busca", async () => {
    const businessId = await login("modos");
    await prisma.client.createMany({ data: ["Alice", "Bruno", "Alicia"].map((name) => ({ businessId, name })) });

    const recent = await get();
    expect(recent.status).toBe(200);
    expect(recent.body.mode).toBe("recent");
    expect(recent.body.clients).toHaveLength(3);
    expect((await get("?q=")).body.mode).toBe("recent");
    expect((await get("?q=%20%20")).body.mode).toBe("recent");

    const search = await get("?q=ali");
    expect(search.body.mode).toBe("search");
    expect(search.body.clients?.map((c) => c.name)).toEqual(["Alice", "Alicia"]);
  });

  it("empresa vem da sessao: o cliente de outra empresa nunca aparece, nem com a busca exata", async () => {
    const other = await login("iso-outra");
    await prisma.client.create({ data: { businessId: other, name: "Cliente Sigiloso" } });
    await login("iso-minha");

    expect((await get("?q=sigiloso")).body.clients).toEqual([]);
    expect((await get()).body.clients).toEqual([]);
  });
});
