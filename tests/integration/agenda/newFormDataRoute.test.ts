import { describe, it, expect, afterAll, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { GET } from "@/app/api/agenda/new-form-data/route";

// GET /api/agenda/new-form-data (dados do popup "Novo agendamento"): sessao obrigatoria; a empresa vem SEMPRE da sessao;
// so servicos/categorias dela; o cliente do pre-preenchimento so volta se for dela (com o WhatsApp).
const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string } }));
vi.mock("@/lib/auth/cookies", () => ({ getCurrentUser: async () => session.user }));

const { Decimal } = Prisma;
const createdUserIds: string[] = [];

async function newBusiness(label: string, currency: "BRL" | "JPY") {
  const user = await prisma.user.create({
    data: { name: `Teste NFD ${label}`, email: `nfd-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "x" },
  });
  createdUserIds.push(user.id);
  const business = await prisma.business.create({ data: { userId: user.id, name: `Empresa NFD ${label}`, currency, timezone: "Asia/Tokyo" } });
  const client = await prisma.client.create({ data: { businessId: business.id, name: `Cliente ${label}`, whatsapp: `090-${label}` } });
  const service = await prisma.product.create({ data: { businessId: business.id, name: `Servico ${label}`, type: "SERVICO", defaultPrice: new Decimal(80) } });
  await prisma.product.create({ data: { businessId: business.id, name: `Produto ${label}`, type: "PRODUTO", defaultPrice: new Decimal(10) } });
  return { user: { id: user.id, name: user.name, email: user.email }, businessId: business.id, clientId: client.id, serviceId: service.id };
}

const get = async (query = "") => {
  const res = await GET(new Request(`http://test/api/agenda/new-form-data${query}`));
  return { status: res.status, body: await res.json() };
};

afterAll(async () => {
  const businesses = await prisma.business.findMany({ where: { userId: { in: createdUserIds } }, select: { id: true } });
  const ids = businesses.map((b) => b.id);
  await prisma.product.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.client.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("GET /api/agenda/new-form-data", () => {
  it("sem sessao: 401", async () => {
    session.user = null;
    expect((await get()).status).toBe(401);
  });

  it("devolve so os servicos da empresa da sessao, categorias de receita, moeda e o hoje da empresa", async () => {
    const a = await newBusiness("A", "JPY");
    const b = await newBusiness("B", "BRL");
    session.user = a.user;
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.services).toEqual([{ id: a.serviceId, name: "Servico A", defaultPrice: "80" }]); // so SERVICO, so a empresa A
    expect(body.categories.length).toBeGreaterThan(0);
    expect(body.categories.every((c: { id: string; name: string }) => Boolean(c.id && c.name))).toBe(true);
    expect(body.currency).toBe("JPY");
    expect(body.todayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.initialClient).toBeNull();
    expect(JSON.stringify(body)).not.toContain(b.serviceId);
  });

  it("clientId da propria empresa: devolve o cliente com o WhatsApp; de outra empresa ou inexistente: null", async () => {
    const a = await newBusiness("C", "BRL");
    const b = await newBusiness("D", "BRL");
    session.user = a.user;
    expect((await get(`?clientId=${a.clientId}`)).body.initialClient).toEqual({ id: a.clientId, name: "Cliente C", tradeName: "", whatsapp: "090-C" });
    expect((await get(`?clientId=${b.clientId}`)).body.initialClient).toBeNull();
    expect((await get("?clientId=nao-existe")).body.initialClient).toBeNull();
  });
});
