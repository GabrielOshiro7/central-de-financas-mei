import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { PATCH as patchTimeZone } from "@/app/api/business/timezone/route";
import { dateKeyToDbDate, dbDateToKey } from "@/lib/time/zoned";

// Etapa F7: PATCH /api/business/timezone grava pais + fuso da empresa do
// usuario da sessao, com a mesma autorizacao das demais rotas de
// Configuracoes > Empresa (sessao valida; empresa resolvida por userId, nunca
// por id vindo do cliente). A sessao e simulada (getCurrentUser), como nas
// demais integracoes de rota.
const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string } }));
vi.mock("@/lib/auth/cookies", () => ({ getCurrentUser: async () => session.user }));

const createdUserIds: string[] = [];

async function newUser(withBusiness = true) {
  const user = await prisma.user.create({
    data: { name: "Teste F7", email: `f7-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "x" },
  });
  createdUserIds.push(user.id);
  const business = withBusiness
    ? await prisma.business.create({ data: { userId: user.id, name: "Empresa F7", currency: "BRL" } })
    : null;
  return { user, business };
}

function patch(body: unknown) {
  return patchTimeZone(
    new Request("http://test/api/business/timezone", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

afterAll(async () => {
  await prisma.financialEntry.deleteMany({ where: { business: { userId: { in: createdUserIds } } } });
  await prisma.business.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("PATCH /api/business/timezone (Etapa F7)", () => {
  it("sem sessão: 401 e nada muda", async () => {
    const { business } = await newUser();
    session.user = null;
    const res = await patch({ country: "BR", timezone: "America/Sao_Paulo" });
    expect(res.status).toBe(401);
    const after = await prisma.business.findUniqueOrThrow({ where: { id: business!.id } });
    expect([after.country, after.timezone]).toEqual(["JP", "Asia/Tokyo"]);
  });

  it("usuário sem empresa: 404", async () => {
    const { user } = await newUser(false);
    session.user = { id: user.id, name: user.name, email: user.email };
    const res = await patch({ country: "BR", timezone: "America/Sao_Paulo" });
    expect(res.status).toBe(404);
  });

  it("grava país + fuso e volta; lançamento já existente mantém o dia", async () => {
    const { user, business } = await newUser();
    session.user = { id: user.id, name: user.name, email: user.email };
    const category = await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } });
    const entry = await prisma.financialEntry.create({
      data: {
        businessId: business!.id, userId: user.id, type: "REVENUE", categoryId: category.id, amount: "100",
        description: "Antes da troca", occurredOn: dateKeyToDbDate("2026-10-20"),
      },
    });

    const res = await patch({ country: "BR", timezone: "America/Manaus" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ country: "BR", timezone: "America/Manaus" });
    let after = await prisma.business.findUniqueOrThrow({ where: { id: business!.id } });
    expect([after.country, after.timezone]).toEqual(["BR", "America/Manaus"]);
    expect(dbDateToKey((await prisma.financialEntry.findUniqueOrThrow({ where: { id: entry.id } })).occurredOn)).toBe("2026-10-20");

    expect((await patch({ country: "JP", timezone: "Asia/Tokyo" })).status).toBe(200);
    after = await prisma.business.findUniqueOrThrow({ where: { id: business!.id } });
    expect([after.country, after.timezone]).toEqual(["JP", "Asia/Tokyo"]);
    expect(dbDateToKey((await prisma.financialEntry.findUniqueOrThrow({ where: { id: entry.id } })).occurredOn)).toBe("2026-10-20");
  });

  it.each([
    [{ country: "BR", timezone: "Asia/Tokyo" }, /não pertence ao país/],
    [{ country: "JP", timezone: "America/Sao_Paulo" }, /não pertence ao país/],
    [{ country: "EU", timezone: "Europe/Paris" }, /País inválido/],
    [{ country: "BR", timezone: "GMT-3" }, /Fuso horário inválido/],
    [{ country: "BR" }, /./],
    [{ country: "BR", timezone: "America/Sao_Paulo", businessId: "outra-empresa" }, /./],
    ["{nao e json", /./],
  ])("recusa %j com 400 e nada muda", async (body, message) => {
    const { user, business } = await newUser();
    session.user = { id: user.id, name: user.name, email: user.email };
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(message);
    const after = await prisma.business.findUniqueOrThrow({ where: { id: business!.id } });
    expect([after.country, after.timezone]).toEqual(["JP", "Asia/Tokyo"]);
  });

  it("só altera a empresa do usuário da sessão (outra empresa intocada)", async () => {
    const a = await newUser();
    const b = await newUser();
    session.user = { id: a.user.id, name: a.user.name, email: a.user.email };
    expect((await patch({ country: "PT", timezone: "Atlantic/Azores" })).status).toBe(200);
    const [after, other] = await Promise.all([
      prisma.business.findUniqueOrThrow({ where: { id: a.business!.id } }),
      prisma.business.findUniqueOrThrow({ where: { id: b.business!.id } }),
    ]);
    expect([after.country, after.timezone]).toEqual(["PT", "Atlantic/Azores"]);
    expect([other.country, other.timezone]).toEqual(["JP", "Asia/Tokyo"]);
  });
});
