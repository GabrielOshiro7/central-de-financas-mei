import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { POST as postAgenda } from "@/app/api/agenda/route";

// ATOMICIDADE REAL do WhatsApp gravado junto do agendamento: a falha acontece DENTRO da transacao, depois de o WhatsApp
// do cliente ja ter sido atualizado (applyClientWhatsapp roda primeiro, a criacao vem depois). O payload passa no Zod e
// na validateDayInput, mas viola uma constraint do banco: valor unitario com 13 digitos inteiros estoura numeric(14,2)
// (so 12 cabem). O rollback tem de desfazer o WhatsApp e nao deixar nada para tras.
const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string } }));
vi.mock("@/lib/auth/cookies", () => ({ getCurrentUser: async () => session.user }));

const { Decimal } = Prisma;
let userId: string;
let businessId: string;
let clientId: string;
let serviceId: string;
let revenueCategoryId: string;

const json = (body: unknown) =>
  new Request("http://test/api/agenda", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function payload(unitPrice: number, clientWhatsapp: string) {
  return {
    clientId,
    scheduledOn: "2026-10-20",
    services: [{ productId: serviceId, quantity: 1, unitPrice }],
    categoryId: revenueCategoryId,
    paymentTiming: "AVISTA",
    installments: [],
    clientWhatsapp,
  };
}

const counts = async () => ({
  appointments: await prisma.appointment.count({ where: { businessId } }),
  appointmentServices: await prisma.appointmentService.count({ where: { appointment: { businessId } } }),
  installments: await prisma.appointmentInstallment.count({ where: { appointment: { businessId } } }),
  bills: await prisma.bill.count({ where: { businessId } }),
  entries: await prisma.financialEntry.count({ where: { businessId } }),
});

beforeAll(async () => {
  revenueCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } })).id;
  const user = await prisma.user.create({
    data: { name: "Teste Atomico", email: `wa-atomic-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "x" },
  });
  userId = user.id;
  session.user = { id: user.id, name: user.name, email: user.email };
  businessId = (await prisma.business.create({ data: { userId, name: "Empresa Atomico", currency: "BRL", timezone: "Asia/Tokyo" } })).id;
  clientId = (await prisma.client.create({ data: { businessId, name: "Cliente Atomico", whatsapp: "090-1111-2222", phone: "03-0000-0000", email: "a@b.example.com" } })).id;
  serviceId = (await prisma.product.create({ data: { businessId, name: "Corte Atomico", type: "SERVICO", defaultPrice: new Decimal(80) } })).id;
});

afterAll(async () => {
  await prisma.appointment.deleteMany({ where: { businessId } });
  await prisma.product.deleteMany({ where: { businessId } });
  await prisma.client.deleteMany({ where: { businessId } });
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe("clientWhatsapp: falha DENTRO da transacao desfaz o WhatsApp", () => {
  it("controle: o mesmo payload com valor valido grava o agendamento E o WhatsApp (o WhatsApp realmente muda nesta rota)", async () => {
    const res = await postAgenda(json(payload(80, "090-9999-0000")));
    expect(res.status).toBe(201);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).whatsapp).toBe("090-9999-0000");
    expect((await counts()).appointments).toBe(1);
    // volta ao estado de partida para o teste seguinte
    await prisma.appointment.deleteMany({ where: { businessId } });
    await prisma.client.update({ where: { id: clientId }, data: { whatsapp: "090-1111-2222" } });
  });

  it("valor unitario que estoura o numeric(14,2): a criacao falha no banco e o WhatsApp do cliente fica igual ao de antes; nada foi criado", async () => {
    const clientBefore = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    const countsBefore = await counts();
    expect(countsBefore).toEqual({ appointments: 0, appointmentServices: 0, installments: 0, bills: 0, entries: 0 });

    // 1.000.000.000.000 = 13 digitos inteiros: passa no Zod (numero finito, nao negativo) e na validateDayInput, e o
    // INSERT do servico do agendamento falha no Postgres (numeric field overflow), dentro da transacao.
    await expect(postAgenda(json(payload(1_000_000_000_000, "090-7777-8888")))).rejects.toThrow();

    // O cadastro do cliente e IDENTICO (whatsapp inclusive; updatedAt tambem, ou seja, nem houve escrita confirmada).
    expect(await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).toEqual(clientBefore);
    // Nenhum agendamento, servico, parcela, conta (bill) ou lancamento financeiro.
    expect(await counts()).toEqual(countsBefore);
  });
});
