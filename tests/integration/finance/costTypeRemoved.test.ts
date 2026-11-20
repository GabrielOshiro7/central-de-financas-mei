import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST as postTransaction } from "@/app/api/financeiro/transactions/route";
import { POST as postRecurring } from "@/app/api/financeiro/recurring/route";
import { POST as postCategory } from "@/app/api/financeiro/categories/route";

// Remocao do tipo "Custo" (migracao 20261120120000_remove_cost_type): as rotas recusam type "COST" com
// 400 (validacao Zod) e o enum do banco so tem REVENUE e EXPENSE. Sessao simulada (as rotas leem o
// usuario de cookies).
const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string; legalAcceptedAt: Date | null; termsVersion: string | null; privacyVersion: string | null } }));
vi.mock("@/lib/auth/cookies", () => ({
  getCurrentUser: async () => session.user,
  getCurrentUserWithSession: async () =>
    session.user ? { user: session.user, sessionId: "s", elevatedUntil: new Date(Date.now() + 3_600_000) } : null,
}));

let userId: string;
let businessId: string;
let expenseCategoryId: string;

function post(handler: (r: Request) => Promise<Response>, body: unknown) {
  return handler(new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { name: "Teste Sem Custo", email: `sem-custo-${Date.now()}@example.com`, passwordHash: "x" },
  });
  userId = user.id;
  session.user = { id: user.id, name: user.name, email: user.email, legalAcceptedAt: user.legalAcceptedAt, termsVersion: user.termsVersion, privacyVersion: user.privacyVersion };
  businessId = (await prisma.business.create({ data: { userId, name: "Empresa Sem Custo", currency: "BRL" } })).id;
  expenseCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "EXPENSE", name: "Mercadoria" } })).id;
});

afterAll(async () => {
  await prisma.financialEntry.deleteMany({ where: { businessId } });
  await prisma.recurringEntry.deleteMany({ where: { businessId } });
  await prisma.category.deleteMany({ where: { businessId } });
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe("a API recusa o tipo COST com 400", () => {
  it("POST /api/financeiro/transactions com type COST -> 400, e com EXPENSE -> 201", async () => {
    const base = { occurredAt: "2026-11-10", description: "Compra", categoryId: expenseCategoryId, amount: 100 };
    const refused = await post(postTransaction, { ...base, type: "COST" });
    expect(refused.status).toBe(400);
    expect(await prisma.financialEntry.count({ where: { businessId } })).toBe(0);

    const accepted = await post(postTransaction, { ...base, type: "EXPENSE" });
    expect(accepted.status).toBe(201);
    expect(await prisma.financialEntry.count({ where: { businessId } })).toBe(1);
  });

  it("POST /api/financeiro/recurring com type COST -> 400", async () => {
    const res = await post(postRecurring, {
      type: "COST",
      categoryId: expenseCategoryId,
      description: "Licença",
      amount: 100,
      frequency: "MONTHLY",
      dayOfMonth: 10,
      startDate: "2026-11-10",
    });
    expect(res.status).toBe(400);
    expect(await prisma.recurringEntry.count({ where: { businessId } })).toBe(0);
  });

  it("POST /api/financeiro/categories com type COST -> 400 (nenhuma categoria criada)", async () => {
    const res = await post(postCategory, { type: "COST", name: "Categoria de custo" });
    expect(res.status).toBe(400);
    expect(await prisma.category.count({ where: { businessId } })).toBe(0);
  });
});

describe("o banco não tem mais o valor COST", () => {
  it("o enum financial_entry_type só tem REVENUE e EXPENSE", async () => {
    const rows = await prisma.$queryRaw<{ label: string }[]>`
      SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'financial_entry_type' ORDER BY e.enumsortorder`;
    expect(rows.map((r) => r.label)).toEqual(["REVENUE", "EXPENSE"]);
  });

  it("as categorias padrão que eram de custo existem como despesa", async () => {
    const names = ["Mercadoria", "Matéria-prima", "Insumos", "Embalagens", "Frete", "Comissões"]; // "Outros custos" segue existindo nos dados antigos
    const found = await prisma.category.findMany({ where: { businessId: null, type: "EXPENSE", name: { in: names } }, select: { name: true } });
    expect(found.map((c) => c.name).sort()).toEqual([...names].sort());
  });
});
