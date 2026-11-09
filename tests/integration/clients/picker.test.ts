import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CLIENT_SEARCH_LIMIT, getClientPickerOption, listRecentClients, searchClientsForPicker } from "@/lib/clients/picker";

// Escolha de cliente da Agenda: recentes (3) e busca (ate 8) - ativos, por empresa.
const { Decimal } = Prisma;
const createdUserIds: string[] = [];
let revenueCategoryId: string;

async function newBusiness(label: string) {
  const user = await prisma.user.create({
    data: { name: `Teste Picker ${label}`, email: `picker-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "x" },
  });
  createdUserIds.push(user.id);
  const business = await prisma.business.create({ data: { userId: user.id, name: `Empresa Picker ${label}`, currency: "BRL" } });
  return { userId: user.id, businessId: business.id };
}

type Biz = Awaited<ReturnType<typeof newBusiness>>;

const at = (iso: string) => new Date(iso);

async function client(biz: Biz, name: string, extra: { tradeName?: string; active?: boolean; createdAt?: Date } = {}) {
  return prisma.client.create({
    data: { businessId: biz.businessId, name, tradeName: extra.tradeName ?? null, active: extra.active ?? true, ...(extra.createdAt ? { createdAt: extra.createdAt } : {}) },
  });
}

// Atendimento (registrado em `createdAt`) - o que conta e a data de criacao do registro.
async function appointment(biz: Biz, clientId: string, createdAt: Date) {
  const startAt = at("2026-06-01T10:00:00Z");
  return prisma.appointment.create({
    data: { businessId: biz.businessId, clientId, startAt, endAt: new Date(startAt.getTime() + 30 * 60_000), createdAt },
  });
}

let saleSeq = 0;
async function sale(biz: Biz, clientId: string, createdAt: Date) {
  saleSeq += 1;
  return prisma.sale.create({
    data: {
      businessId: biz.businessId, clientId, categoryId: revenueCategoryId, userId: biz.userId, saleNumber: saleSeq,
      saleOn: new Date("2026-06-01T00:00:00Z"), subtotal: new Decimal(10), total: new Decimal(10),
      clientRequestId: `picker-${biz.businessId}-${saleSeq}`, createdAt,
    },
  });
}

const names = (list: { name: string }[]) => list.map((c) => c.name);

beforeAll(async () => {
  revenueCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } })).id;
});

afterAll(async () => {
  const businesses = await prisma.business.findMany({ where: { userId: { in: createdUserIds } }, select: { id: true } });
  const ids = businesses.map((b) => b.id);
  await prisma.sale.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.appointment.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.client.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("clientes recentes (listRecentClients)", () => {
  it("os 3 ativos com o atendimento OU a venda registrado mais recentemente, do mais recente ao mais antigo", async () => {
    const biz = await newBusiness("rec-ordem");
    const [a, b, c, d, e] = await Promise.all(["Ana", "Bia", "Caio", "Davi", "Eva"].map((n) => client(biz, n)));
    await appointment(biz, a.id, at("2026-03-01T00:00:00Z")); // mais antigo
    await sale(biz, b.id, at("2026-05-01T00:00:00Z")); // venda
    await appointment(biz, c.id, at("2026-06-01T00:00:00Z")); // mais recente
    await appointment(biz, d.id, at("2026-02-01T00:00:00Z")); // fora dos 3
    void e;

    expect(names(await listRecentClients(biz.businessId))).toEqual(["Caio", "Bia", "Ana"]);
  });

  it("vale o registro mais recente entre atendimento e venda do mesmo cliente", async () => {
    const biz = await newBusiness("rec-ambos");
    const [a, b] = await Promise.all(["Ana", "Bia"].map((n) => client(biz, n)));
    await appointment(biz, a.id, at("2026-01-01T00:00:00Z"));
    await sale(biz, a.id, at("2026-07-01T00:00:00Z")); // a venda e a mais recente de todas
    await appointment(biz, b.id, at("2026-04-01T00:00:00Z"));

    expect(names(await listRecentClients(biz.businessId))).toEqual(["Ana", "Bia"]);
  });

  it("menos de 3 usados: completa com os ativos cadastrados mais recentemente", async () => {
    const biz = await newBusiness("rec-completa");
    const usado = await client(biz, "Usado", { createdAt: at("2026-01-01T00:00:00Z") });
    await client(biz, "Antigo", { createdAt: at("2026-01-02T00:00:00Z") });
    await client(biz, "Novo", { createdAt: at("2026-06-02T00:00:00Z") });
    await client(biz, "Novissimo", { createdAt: at("2026-06-03T00:00:00Z") });
    await appointment(biz, usado.id, at("2026-05-01T00:00:00Z"));

    expect(names(await listRecentClients(biz.businessId))).toEqual(["Usado", "Novissimo", "Novo"]);
  });

  it("sem nenhum registro: so os cadastrados mais recentemente; sem clientes: lista vazia", async () => {
    const biz = await newBusiness("rec-sem-uso");
    expect(await listRecentClients(biz.businessId)).toEqual([]);
    for (const [i, n] of ["C1", "C2", "C3", "C4"].entries()) await client(biz, n, { createdAt: at(`2026-02-0${i + 1}T00:00:00Z`) });
    expect(names(await listRecentClients(biz.businessId))).toEqual(["C4", "C3", "C2"]);
  });

  it("so clientes ativos: inativo com o registro mais recente fica de fora", async () => {
    const biz = await newBusiness("rec-ativos");
    const inativo = await client(biz, "Inativo", { active: false });
    const ativo = await client(biz, "Ativo");
    await appointment(biz, inativo.id, at("2026-09-01T00:00:00Z"));
    await appointment(biz, ativo.id, at("2026-01-01T00:00:00Z"));

    expect(names(await listRecentClients(biz.businessId))).toEqual(["Ativo"]);
  });

  it("isolamento: clientes e registros de outra empresa nunca aparecem", async () => {
    const mine = await newBusiness("rec-iso-a");
    const other = await newBusiness("rec-iso-b");
    const meu = await client(mine, "Meu cliente");
    const alheio = await client(other, "Cliente alheio");
    await appointment(other, alheio.id, at("2026-12-01T00:00:00Z"));
    await sale(other, alheio.id, at("2026-12-02T00:00:00Z"));
    await appointment(mine, meu.id, at("2026-01-01T00:00:00Z"));

    expect(names(await listRecentClients(mine.businessId))).toEqual(["Meu cliente"]);
    expect(names(await listRecentClients(other.businessId))).toEqual(["Cliente alheio"]);
  });

  it("devolve id, nome e nome fantasia (vazio quando nao ha)", async () => {
    const biz = await newBusiness("rec-forma");
    const c = await client(biz, "Studio Um", { tradeName: "Um & Cia" });
    const d = await client(biz, "Sem Fantasia", { createdAt: at("2026-01-01T00:00:00Z") });
    expect(await listRecentClients(biz.businessId)).toEqual([
      { id: c.id, name: "Studio Um", tradeName: "Um & Cia" },
      { id: d.id, name: "Sem Fantasia", tradeName: "" },
    ]);
  });
});

describe("busca de clientes (searchClientsForPicker)", () => {
  it("ignora maiusculas e acentos, no termo e no nome (e = é = É, c = ç, ~ e macron)", async () => {
    const biz = await newBusiness("busca-acentos");
    await Promise.all(["José Álvares", "Conceição Ñandú", "Tōkyō Studio", "Maria"].map((n) => client(biz, n)));

    expect(names(await searchClientsForPicker(biz.businessId, "jose"))).toEqual(["José Álvares"]);
    expect(names(await searchClientsForPicker(biz.businessId, "JOSÉ"))).toEqual(["José Álvares"]);
    expect(names(await searchClientsForPicker(biz.businessId, "alvares"))).toEqual(["José Álvares"]);
    expect(names(await searchClientsForPicker(biz.businessId, "conceicao"))).toEqual(["Conceição Ñandú"]);
    expect(names(await searchClientsForPicker(biz.businessId, "nandu"))).toEqual(["Conceição Ñandú"]);
    expect(names(await searchClientsForPicker(biz.businessId, "tokyo"))).toEqual(["Tōkyō Studio"]);
    expect(names(await searchClientsForPicker(biz.businessId, "TŌKYŌ"))).toEqual(["Tōkyō Studio"]);
    // Termo decomposto (e + acento combinante, como alguns teclados enviam) tambem acha.
    expect(names(await searchClientsForPicker(biz.businessId, "josé"))).toEqual(["José Álvares"]);
    expect(names(await searchClientsForPicker(biz.businessId, "josé"))).toEqual(["José Álvares"]);
  });

  it("procura tambem no nome fantasia", async () => {
    const biz = await newBusiness("busca-fantasia");
    await client(biz, "Rafael Costa", { tradeName: "Barbearia Ímpar" });
    await client(biz, "Outro Nome");
    expect(names(await searchClientsForPicker(biz.businessId, "impar"))).toEqual(["Rafael Costa"]);
    expect(names(await searchClientsForPicker(biz.businessId, "barbearia"))).toEqual(["Rafael Costa"]);
  });

  it("no maximo 8 resultados; quem comeca com o termo vem primeiro, depois por nome", async () => {
    const biz = await newBusiness("busca-limite");
    await Promise.all(Array.from({ length: 6 }, (_, i) => client(biz, `Cliente Ana ${i + 1}`)));
    await Promise.all(Array.from({ length: 6 }, (_, i) => client(biz, `Ana Lima ${i + 1}`)));
    const result = await searchClientsForPicker(biz.businessId, "ana");
    expect(CLIENT_SEARCH_LIMIT).toBe(8);
    expect(result).toHaveLength(8);
    expect(names(result)).toEqual([...Array.from({ length: 6 }, (_, i) => `Ana Lima ${i + 1}`), "Cliente Ana 1", "Cliente Ana 2"]);
  });

  it("so clientes ativos", async () => {
    const biz = await newBusiness("busca-ativos");
    await client(biz, "Paula Ativa");
    await client(biz, "Paula Inativa", { active: false });
    expect(names(await searchClientsForPicker(biz.businessId, "paula"))).toEqual(["Paula Ativa"]);
  });

  it("isolamento: nunca devolve cliente de outra empresa", async () => {
    const mine = await newBusiness("busca-iso-a");
    const other = await newBusiness("busca-iso-b");
    await client(mine, "Carlos Meu");
    await client(other, "Carlos Alheio");
    expect(names(await searchClientsForPicker(mine.businessId, "carlos"))).toEqual(["Carlos Meu"]);
    expect(names(await searchClientsForPicker(other.businessId, "carlos"))).toEqual(["Carlos Alheio"]);
  });

  it("curingas do LIKE sao literais; termo vazio nao busca nada", async () => {
    const biz = await newBusiness("busca-literal");
    await Promise.all(["Desconto 100% Ltda", "Sao_Paulo", "Cliente Comum", "Barra\\Invertida"].map((n) => client(biz, n)));
    expect(names(await searchClientsForPicker(biz.businessId, "%"))).toEqual(["Desconto 100% Ltda"]);
    expect(names(await searchClientsForPicker(biz.businessId, "_"))).toEqual(["Sao_Paulo"]);
    expect(names(await searchClientsForPicker(biz.businessId, "\\"))).toEqual(["Barra\\Invertida"]);
    expect(await searchClientsForPicker(biz.businessId, "   ")).toEqual([]);
    expect(await searchClientsForPicker(biz.businessId, "")).toEqual([]);
  });

  it("injecao de SQL no termo e inerte (parametros, nunca concatenacao)", async () => {
    const biz = await newBusiness("busca-sqli");
    await client(biz, "Cliente Seguro");
    expect(await searchClientsForPicker(biz.businessId, "'; DROP TABLE clients; --")).toEqual([]);
    expect(names(await searchClientsForPicker(biz.businessId, "seguro"))).toEqual(["Cliente Seguro"]);
  });
});

describe("cliente ja escolhido (getClientPickerOption)", () => {
  it("devolve o cliente da empresa (ativo ou nao) e nunca o de outra", async () => {
    const mine = await newBusiness("opt-a");
    const other = await newBusiness("opt-b");
    const inativo = await client(mine, "Cliente Inativo", { active: false, tradeName: "Fantasia" });
    const alheio = await client(other, "Alheio");
    expect(await getClientPickerOption(mine.businessId, inativo.id)).toEqual({ id: inativo.id, name: "Cliente Inativo", tradeName: "Fantasia" });
    expect(await getClientPickerOption(mine.businessId, alheio.id)).toBeNull();
    expect(await getClientPickerOption(mine.businessId, "nao-existe")).toBeNull();
  });
});
