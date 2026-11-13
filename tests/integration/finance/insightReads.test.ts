import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { getInsightsForBusiness } from "@/lib/insights/queries";
import { generateInsightsForBusiness } from "@/lib/insights/mutations";
import { countUnreadInsights, insightKey, listReadKeys, parseInsightKey, setInsightRead } from "@/lib/insights/reads";
import { processClock } from "../../helpers/processClock";
import { dbDateOfInstant } from "@/lib/time/zoned";

// Estado lido/nao lido dos insights POR USUARIO, com chave estavel
// ("<metrica>:<yyyy-mm>") entre recalculos. Dados em Asia/Tokyo (como nos testes de
// insights); relogio fixo em setembro/outubro de 2026.
const TZ = "Asia/Tokyo";
const createdUserIds: string[] = [];
const createdBusinessIds: string[] = [];

async function setup(name: string) {
  const [revenue, expense] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } }),
    prisma.category.findFirstOrThrow({ where: { businessId: null, type: "EXPENSE" } }),
  ]);
  const user = await prisma.user.create({
    data: { name, email: `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: await hashPassword("SenhaValida123") },
  });
  const business = await prisma.business.create({ data: { userId: user.id, name, currency: "BRL", timezone: TZ } });
  createdUserIds.push(user.id);
  createdBusinessIds.push(business.id);
  const entry = (type: "REVENUE" | "EXPENSE", description: string, amount: string, date: Date) =>
    prisma.financialEntry.create({
      data: { businessId: business.id, userId: user.id, type, categoryId: type === "REVENUE" ? revenue.id : expense.id, description, amount, occurredOn: dbDateOfInstant(date, TZ) },
    });
  return { userId: user.id, businessId: business.id, entry };
}

const SEP = processClock(new Date(2026, 8, 15)); // 15/09/2026

// Agosto x setembro (ate o dia 15): receita e despesa crescem bastante => ao menos 2 insights.
async function seedGrowth(entry: Awaited<ReturnType<typeof setup>>["entry"]) {
  await entry("REVENUE", "Ago", "1000", new Date(2026, 7, 10));
  await entry("REVENUE", "Set", "1500", new Date(2026, 8, 5));
  await entry("EXPENSE", "Ago desp", "200", new Date(2026, 7, 10));
  await entry("EXPENSE", "Set desp", "800", new Date(2026, 8, 5));
}

afterAll(async () => {
  await prisma.insightRead.deleteMany({ where: { businessId: { in: createdBusinessIds } } });
  await prisma.insight.deleteMany({ where: { businessId: { in: createdBusinessIds } } });
  await prisma.financialEntry.deleteMany({ where: { businessId: { in: createdBusinessIds } } });
  await prisma.business.deleteMany({ where: { id: { in: createdBusinessIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("chave do insight", () => {
  it("é <métrica em minúsculas>:<yyyy-mm> e só aceita métricas/meses válidos", () => {
    expect(insightKey("EXPENSE_GROWTH", "2026-11")).toBe("expense_growth:2026-11");
    expect(parseInsightKey("expense_growth:2026-11")).toEqual({ metric: "EXPENSE_GROWTH", periodKey: "2026-11" });
    for (const bad of ["", "expense_growth", "expense_growth:2026-13", "nao_existe:2026-11", "EXPENSE_GROWTH:2026-11", "expense_growth:2026-11;drop"]) {
      expect(parseInsightKey(bad)).toBeNull();
    }
  });
});

describe("marcar e desmarcar como lido", () => {
  it("lido -> aparece em listReadKeys (idempotente, uma única linha); não lido -> some; chave inexistente é recusada", async () => {
    const { userId, businessId, entry } = await setup("Reads Basico");
    await seedGrowth(entry);
    const insights = await getInsightsForBusiness(businessId, SEP);
    expect(insights.length).toBeGreaterThanOrEqual(2);
    const key = insightKey(insights[0].metric, insights[0].periodKey);

    expect(await listReadKeys(userId, businessId, [key])).toEqual(new Set());
    expect(await setInsightRead(userId, businessId, key, true)).toEqual({ ok: true });
    expect(await setInsightRead(userId, businessId, key, true)).toEqual({ ok: true });
    expect(await prisma.insightRead.count({ where: { userId, businessId, insightKey: key } })).toBe(1);
    expect(await listReadKeys(userId, businessId, [key])).toEqual(new Set([key]));

    expect(await setInsightRead(userId, businessId, key, false)).toEqual({ ok: true });
    expect(await listReadKeys(userId, businessId, [key])).toEqual(new Set());

    expect(await setInsightRead(userId, businessId, "revenue_growth:1999-01", true)).toEqual({ ok: false, error: "Insight não encontrado." });
    expect(await setInsightRead(userId, businessId, "lixo", true)).toEqual({ ok: false, error: "Insight inválido." });
  });
});

describe("isolamento por usuário e por empresa", () => {
  it("o estado de um usuário não vaza para outro (mesma empresa) nem para outra empresa", async () => {
    const a = await setup("Reads Isolamento A");
    await seedGrowth(a.entry);
    const insights = await getInsightsForBusiness(a.businessId, SEP);
    const key = insightKey(insights[0].metric, insights[0].periodKey);

    // Outro usuário (mesmo businessId): conta e lê por conta própria.
    const other = await prisma.user.create({ data: { name: "Outro", email: `outro-${Date.now()}@example.com`, passwordHash: "x" } });
    createdUserIds.push(other.id);

    await setInsightRead(a.userId, a.businessId, key, true);
    expect(await countUnreadInsights(a.userId, a.businessId, SEP)).toBe(insights.length - 1);
    expect(await countUnreadInsights(other.id, a.businessId, SEP)).toBe(insights.length); // outro usuário: nada lido
    expect(await listReadKeys(other.id, a.businessId, [key])).toEqual(new Set());

    // Outra empresa com a MESMA chave: o estado não vaza e a chave de A não existe em B.
    const b = await setup("Reads Isolamento B");
    await seedGrowth(b.entry);
    await getInsightsForBusiness(b.businessId, SEP);
    expect(await listReadKeys(b.userId, b.businessId, [key])).toEqual(new Set());
    expect(await countUnreadInsights(b.userId, b.businessId, SEP)).toBeGreaterThanOrEqual(2);
    // Ler a chave de A no contexto de A para um usuário de B não cria nada em A.
    expect(await listReadKeys(b.userId, a.businessId, [key])).toEqual(new Set());
    expect(await prisma.insightRead.count({ where: { businessId: a.businessId } })).toBe(1);
  });
});

describe("estabilidade da chave após recalcular", () => {
  it("mesmos dados: o insight lido continua lido; contagem não muda", async () => {
    const { userId, businessId, entry } = await setup("Reads Estavel");
    await seedGrowth(entry);
    const before = await getInsightsForBusiness(businessId, SEP);
    const target = before.find((i) => i.metric === "REVENUE_GROWTH")!;
    const key = insightKey(target.metric, target.periodKey);
    await setInsightRead(userId, businessId, key, true);
    const unread = await countUnreadInsights(userId, businessId, SEP);

    await generateInsightsForBusiness(businessId, SEP, { withAI: false }); // "Atualizar insights" com os mesmos dados
    await generateInsightsForBusiness(businessId, SEP, { withAI: false });
    const after = await getInsightsForBusiness(businessId, SEP);
    expect(after.map((i) => insightKey(i.metric, i.periodKey)).sort()).toEqual(before.map((i) => insightKey(i.metric, i.periodKey)).sort());
    expect(await listReadKeys(userId, businessId, [key])).toEqual(new Set([key]));
    expect(await countUnreadInsights(userId, businessId, SEP)).toBe(unread);
  });

  it("o mesmo insight com números diferentes (dados mudaram) mantém a chave e o estado de lido", async () => {
    const { userId, businessId, entry } = await setup("Reads Numero Muda");
    await seedGrowth(entry);
    const before = (await getInsightsForBusiness(businessId, SEP)).find((i) => i.metric === "REVENUE_GROWTH")!;
    const key = insightKey(before.metric, before.periodKey);
    await setInsightRead(userId, businessId, key, true);

    await entry("REVENUE", "Set extra", "600", new Date(2026, 8, 8)); // muda o valor do insight
    const after = (await getInsightsForBusiness(businessId, SEP)).find((i) => i.metric === "REVENUE_GROWTH")!;
    expect(after.currentValue?.toString()).not.toBe(before.currentValue?.toString());
    expect(insightKey(after.metric, after.periodKey)).toBe(key);
    expect((await listReadKeys(userId, businessId, [key])).has(key)).toBe(true);
  });

  it("a métrica deixa de disparar e volta (linha nova, outro id): a chave é a mesma e continua lida", async () => {
    const { userId, businessId, entry } = await setup("Reads Some Volta");
    await seedGrowth(entry);
    const first = (await getInsightsForBusiness(businessId, SEP)).find((i) => i.metric === "REVENUE_GROWTH")!;
    const key = insightKey(first.metric, first.periodKey);
    await setInsightRead(userId, businessId, key, true);

    await prisma.insight.delete({ where: { id: first.id } }); // como se tivesse deixado de disparar
    await generateInsightsForBusiness(businessId, SEP, { withAI: false });
    const back = (await getInsightsForBusiness(businessId, SEP)).find((i) => i.metric === "REVENUE_GROWTH")!;
    expect(back.id).not.toBe(first.id);
    expect(insightKey(back.metric, back.periodKey)).toBe(key);
    expect((await listReadKeys(userId, businessId, [key])).has(key)).toBe(true);
  });
});

describe("insights novos entram como não lidos", () => {
  it("outra métrica do mesmo mês e a mesma métrica em outro mês têm chave nova (não lida); a contagem reflete", async () => {
    const { userId, businessId, entry } = await setup("Reads Novos");
    await seedGrowth(entry);
    const sept = await getInsightsForBusiness(businessId, SEP);
    expect(await countUnreadInsights(userId, businessId, SEP)).toBe(sept.length); // todos novos = não lidos

    const revenue = sept.find((i) => i.metric === "REVENUE_GROWTH")!;
    await setInsightRead(userId, businessId, insightKey(revenue.metric, revenue.periodKey), true);
    expect(await countUnreadInsights(userId, businessId, SEP)).toBe(sept.length - 1); // as outras métricas seguem não lidas

    // Outubro: a receita de setembro vira a base e outubro cresce => REVENUE_GROWTH:2026-10 é outra chave.
    await entry("REVENUE", "Out", "4000", new Date(2026, 9, 5));
    const OCT = processClock(new Date(2026, 9, 15));
    const oct = await getInsightsForBusiness(businessId, OCT);
    const octRevenue = oct.find((i) => i.metric === "REVENUE_GROWTH");
    expect(octRevenue).toBeDefined();
    expect(octRevenue!.periodKey).toBe("2026-10");
    expect(await listReadKeys(userId, businessId, [insightKey(octRevenue!.metric, octRevenue!.periodKey)])).toEqual(new Set());
    expect(await countUnreadInsights(userId, businessId, OCT)).toBe(oct.length); // conjunto de outubro: todos não lidos
    // E a leitura de setembro continua guardada.
    expect((await listReadKeys(userId, businessId, [insightKey("REVENUE_GROWTH", "2026-09")])).size).toBe(1);
  });

  it("sem insights gerados: contagem 0", async () => {
    const { userId, businessId } = await setup("Reads Vazio");
    expect(await countUnreadInsights(userId, businessId, SEP)).toBe(0);
  });
});
