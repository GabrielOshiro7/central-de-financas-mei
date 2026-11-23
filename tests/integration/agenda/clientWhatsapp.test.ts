import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { POST as postAgenda } from "@/app/api/agenda/route";
import { PATCH as patchAgenda } from "@/app/api/agenda/[id]/route";

// WhatsApp do cliente gravado JUNTO do agendamento (popup "Novo agendamento"): payload POST /api/agenda ganha
// clientWhatsapp (opcional); na MESMA transacao da criacao so client.whatsapp muda (nunca updateClient, que gravaria
// null nos outros campos opcionais). Pelas rotas, como a tela chama.
const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string } }));
vi.mock("@/lib/auth/cookies", () => ({ getCurrentUser: async () => session.user }));

const { Decimal } = Prisma;
const createdUserIds: string[] = [];
let revenueCategoryId: string;
let expenseCategoryId: string;

// Cliente com TODOS os campos opcionais preenchidos: qualquer campo apagado sem querer aparece na comparacao.
const FULL_CLIENT = {
  tradeName: "Fantasia Ltda",
  clientType: "PESSOA_JURIDICA" as const,
  document: "12.345.678/0001-90",
  phone: "03-1111-2222",
  whatsapp: "090-1111-2222",
  email: "contato@cliente.example.com",
  addressLine: "Rua A, 10",
  city: "Tokyo",
  state: "Tokyo",
  country: "Japão",
  notes: "Cliente importante",
};

async function newBusiness(label: string) {
  const user = await prisma.user.create({
    data: { name: `Teste WA ${label}`, email: `wa-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "x" },
  });
  createdUserIds.push(user.id);
  const business = await prisma.business.create({ data: { userId: user.id, name: `Empresa WA ${label}`, currency: "BRL", timezone: "Asia/Tokyo" } });
  const client = await prisma.client.create({ data: { businessId: business.id, name: `Cliente ${label}`, ...FULL_CLIENT } });
  const service = await prisma.product.create({ data: { businessId: business.id, name: `Corte ${label}`, type: "SERVICO", defaultPrice: new Decimal(60) } });
  return { user: { id: user.id, name: user.name, email: user.email }, businessId: business.id, clientId: client.id, serviceId: service.id };
}

type Biz = Awaited<ReturnType<typeof newBusiness>>;
let mine: Biz;
let other: Biz;

const json = (method: string, body: unknown) =>
  new Request("http://test/api/agenda", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// Payload como o popup manda (com valor, a vista).
function payload(biz: Biz, overrides: Record<string, unknown> = {}) {
  return {
    clientId: biz.clientId,
    scheduledOn: "2026-10-20",
    services: [{ productId: biz.serviceId, quantity: 1, unitPrice: 60 }],
    categoryId: revenueCategoryId,
    paymentTiming: "AVISTA",
    installments: [],
    ...overrides,
  };
}

async function post(body: unknown) {
  const res = await postAgenda(json("POST", body));
  return { status: res.status, body: (await res.json()) as { id?: string; error?: string } };
}

const clientRow = (id: string) => prisma.client.findUniqueOrThrow({ where: { id } });
const withoutWhatsapp = <T extends { whatsapp: string | null; updatedAt: Date }>(row: T) => {
  const { whatsapp: _whatsapp, updatedAt: _updatedAt, ...rest } = row;
  void _whatsapp;
  void _updatedAt;
  return rest;
};

beforeAll(async () => {
  revenueCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } })).id;
  expenseCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "EXPENSE" } })).id;
  mine = await newBusiness("a");
  other = await newBusiness("b");
});

afterAll(async () => {
  const businesses = await prisma.business.findMany({ where: { userId: { in: createdUserIds } }, select: { id: true } });
  const ids = businesses.map((b) => b.id);
  await prisma.appointment.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.product.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.client.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("POST /api/agenda com clientWhatsapp", () => {
  it("a) valor diferente: SO o whatsapp do cliente muda; todos os outros campos do cliente ficam iguais", async () => {
    session.user = mine.user;
    const before = await clientRow(mine.clientId);
    expect(before.whatsapp).toBe(FULL_CLIENT.whatsapp);

    const res = await post(payload(mine, { clientWhatsapp: "+81 90-9999-0000" }));
    expect(res.status).toBe(201);

    const after = await clientRow(mine.clientId);
    expect(after.whatsapp).toBe("+81 90-9999-0000");
    // Registro inteiro (menos whatsapp e updatedAt) identico: phone, email, document, endereco, notes...
    expect(withoutWhatsapp(after)).toEqual(withoutWhatsapp(before));
    expect(await prisma.appointment.count({ where: { id: res.body.id } })).toBe(1);
  });

  it("b) vazio remove o whatsapp; igual ao atual nao escreve; ausente nao mexe", async () => {
    session.user = mine.user;
    await prisma.client.update({ where: { id: mine.clientId }, data: { whatsapp: "090-5555-6666" } });

    // igual ao atual (ate com espacos nas pontas): nao escreve (updatedAt nao muda)
    const before = await clientRow(mine.clientId);
    expect((await post(payload(mine, { clientWhatsapp: "  090-5555-6666 " }))).status).toBe(201);
    const same = await clientRow(mine.clientId);
    expect(same.whatsapp).toBe("090-5555-6666");
    expect(same.updatedAt.getTime()).toBe(before.updatedAt.getTime());

    // ausente: nao mexe
    expect((await post(payload(mine))).status).toBe(201);
    expect((await clientRow(mine.clientId)).updatedAt.getTime()).toBe(before.updatedAt.getTime());

    // "" remove (o usuario viu o valor e apagou de proposito); o resto do cadastro continua
    expect((await post(payload(mine, { clientWhatsapp: "" }))).status).toBe(201);
    const removed = await clientRow(mine.clientId);
    expect(removed.whatsapp).toBeNull();
    expect(withoutWhatsapp(removed)).toEqual(withoutWhatsapp(before));
  });

  it("c) cliente de outra empresa: recusado e nada muda (nem agendamento, nem whatsapp)", async () => {
    session.user = mine.user;
    const otherBefore = await clientRow(other.clientId);
    const appointmentsBefore = await prisma.appointment.count({ where: { businessId: mine.businessId } });

    const res = await post(payload(mine, { clientId: other.clientId, clientWhatsapp: "000-INVADIDO" }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Cliente não encontrado.");

    expect(await clientRow(other.clientId)).toEqual(otherBefore);
    expect(await prisma.appointment.count({ where: { businessId: mine.businessId } })).toBe(appointmentsBefore);
  });

  it("d) VALIDACAO: categoria invalida com valor e recusada ANTES da transacao e o whatsapp NAO muda (a atomicidade real esta em clientWhatsappAtomic.test.ts)", async () => {
    session.user = mine.user;
    const before = await clientRow(mine.clientId);
    const appointmentsBefore = await prisma.appointment.count({ where: { businessId: mine.businessId } });

    // categoria de DESPESA num agendamento com valor: recusado na validacao
    const res = await post(payload(mine, { categoryId: expenseCategoryId, clientWhatsapp: "090-0000-0000" }));
    expect(res.status).toBe(400);

    expect(await clientRow(mine.clientId)).toEqual(before);
    expect(await prisma.appointment.count({ where: { businessId: mine.businessId } })).toBe(appointmentsBefore);
  });

  it("limite de 40 caracteres no back: 40 grava, 41 e recusado com 400 e o cadastro nao muda", async () => {
    session.user = mine.user;
    expect((await post(payload(mine, { clientWhatsapp: "9".repeat(40) }))).status).toBe(201);
    expect((await clientRow(mine.clientId)).whatsapp).toBe("9".repeat(40));
    const before = await clientRow(mine.clientId);
    const res = await post(payload(mine, { clientWhatsapp: "8".repeat(41) }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Use no máximo 40 caracteres.");
    expect(await clientRow(mine.clientId)).toEqual(before);
  });

  it("clientWhatsapp sem cliente: recusado; e o PATCH (edicao) recusa o campo", async () => {
    session.user = mine.user;
    const noClient = await post({ scheduledOn: "2026-10-20", title: "Reuniao", services: [], clientWhatsapp: "090" });
    expect(noClient.status).toBe(400);
    expect(noClient.body.error).toMatch(/cliente/i);

    const created = await post(payload(mine));
    expect(created.status).toBe(201);
    const before = await clientRow(mine.clientId);
    const res = await patchAgenda(json("PATCH", payload(mine, { clientWhatsapp: "090-777" })), { params: Promise.resolve({ id: created.body.id! }) });
    expect(res.status).toBe(400);
    expect(await clientRow(mine.clientId)).toEqual(before);
  });
});
