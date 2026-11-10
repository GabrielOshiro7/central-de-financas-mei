import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { POST as postAgenda } from "@/app/api/agenda/route";
import { PATCH as patchAgenda } from "@/app/api/agenda/[id]/route";
import { POST as postStatus } from "@/app/api/agenda/[id]/status/route";
import { POST as postComplete } from "@/app/api/agenda/[id]/complete/route";
import { addDays, clockFor, dbDateToKey, todayKey } from "@/lib/time/zoned";

// Agenda A3: o fluxo por dia (DAY) pelas rotas, como a tela chama - criar
// (toda criacao nova e DAY), editar so em AGENDADO, cancelar/faltar/reabrir
// (tirando da conclusao automatica) e "Concluir agora". Sessao simulada.
const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string } }));
vi.mock("@/lib/auth/cookies", () => ({ getCurrentUser: async () => session.user }));

const { Decimal } = Prisma;
const createdUserIds: string[] = [];
let serviceRevenueCategoryId: string;
let expenseCategoryId: string;

async function login(timezone: string) {
  const user = await prisma.user.create({
    data: { name: "Teste A3", email: `a3-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "x" },
  });
  createdUserIds.push(user.id);
  const business = await prisma.business.create({ data: { userId: user.id, name: `Empresa A3 ${timezone}`, currency: "BRL", timezone } });
  session.user = { id: user.id, name: user.name, email: user.email };
  const client = await prisma.client.create({ data: { businessId: business.id, name: "Cliente A3" } });
  // Servicos SEM duracao (criacao rapida do fluxo por dia).
  const [corte, barba] = await Promise.all([
    prisma.product.create({ data: { businessId: business.id, name: "Corte", type: "SERVICO", defaultPrice: new Decimal(60) } }),
    prisma.product.create({ data: { businessId: business.id, name: "Barba", type: "SERVICO", defaultPrice: new Decimal(25) } }),
  ]);
  return { userId: user.id, businessId: business.id, clientId: client.id, corteId: corte.id, barbaId: barba.id, today: todayKey(clockFor({ timezone })) };
}

type Ctx = Awaited<ReturnType<typeof login>>;

const json = (method: string, url: string, body?: unknown) =>
  new Request(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function payload(ctx: Ctx, overrides: Record<string, unknown> = {}) {
  return {
    clientId: ctx.clientId,
    scheduledOn: "2026-10-20",
    services: [
      { productId: ctx.corteId, quantity: 1, unitPrice: 60 },
      { productId: ctx.barbaId, quantity: 2, unitPrice: 25 },
    ],
    categoryId: serviceRevenueCategoryId,
    paymentTiming: "AVISTA",
    paymentMethod: "PIX",
    installments: [],
    notes: "Obs A3",
    ...overrides,
  };
}

async function create(ctx: Ctx, overrides: Record<string, unknown> = {}) {
  const res = await postAgenda(json("POST", "http://test/api/agenda", payload(ctx, overrides)));
  const body = (await res.json()) as { id?: string; error?: string };
  return { status: res.status, ...body };
}

async function row(id: string) {
  return prisma.appointment.findUniqueOrThrow({
    where: { id },
    include: { services: { orderBy: { position: "asc" } }, installments: { orderBy: { position: "asc" } } },
  });
}

async function setStatus(id: string, status: string) {
  const res = await postStatus(json("POST", `http://test/api/agenda/${id}/status`, { status }), params(id));
  return { status: res.status, ...((await res.json()) as { error?: string }) };
}

beforeAll(async () => {
  serviceRevenueCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE", name: "Venda de serviços" } })).id;
  expenseCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "EXPENSE" } })).id;
});

afterAll(async () => {
  const businesses = await prisma.business.findMany({ where: { userId: { in: createdUserIds } }, select: { id: true } });
  const ids = businesses.map((b) => b.id);
  await prisma.appointment.updateMany({ where: { businessId: { in: ids } }, data: { saleId: null } });
  await prisma.financialEntry.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.bill.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.sale.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.appointment.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.product.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.client.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe.each(["Asia/Tokyo", "America/Sao_Paulo"] as const)("agendamento por dia pelas rotas - empresa em %s", (tz) => {
  it("criar à vista: DAY, AGENDADO, elegível ao automático, valores por serviço, sem horário nem parcelas", async () => {
    const ctx = await login(tz);
    const created = await create(ctx);
    expect(created.status).toBe(201);
    const a = await row(created.id!);
    expect([a.kind, a.status, a.autoCompleteEligible, dbDateToKey(a.scheduledOn!), a.categoryId, a.paymentTiming, a.paymentMethod, a.notes]).toEqual([
      "DAY", "AGENDADO", true, "2026-10-20", serviceRevenueCategoryId, "AVISTA", "PIX", "Obs A3",
    ]);
    expect([a.startAt, a.endAt]).toEqual([null, null]);
    expect(a.services.map((s) => [s.nameSnapshot, s.quantity, s.unitPrice?.toString(), s.durationMinutesSnapshot])).toEqual([
      ["Corte", 1, "60", null],
      ["Barba", 2, "25", null],
    ]);
    expect(a.installments).toHaveLength(0);
  });

  it("criar a prazo: parcelas planejadas gravadas em ordem", async () => {
    const ctx = await login(tz);
    const created = await create(ctx, {
      paymentTiming: "APRAZO",
      installments: [{ dueOn: "2026-11-20", amount: 50 }, { dueOn: "2026-12-20", amount: 60 }],
    });
    expect(created.status).toBe(201);
    const a = await row(created.id!);
    expect(a.paymentTiming).toBe("APRAZO");
    expect(a.installments.map((i) => [i.position, dbDateToKey(i.dueOn), i.amount.toString()])).toEqual([
      [0, "2026-11-20", "50"],
      [1, "2026-12-20", "60"],
    ]);
  });

  it.each([
    [{ paymentTiming: "APRAZO", installments: [{ dueOn: "2026-11-20", amount: 50 }] }, /soma das parcelas/],
    [{ paymentTiming: "APRAZO", installments: [{ dueOn: "2026-10-19", amount: 110 }] }, /antes do dia do atendimento/],
    [{ paymentTiming: "APRAZO", installments: [] }, /ao menos uma parcela/],
    [{ installments: [{ dueOn: "2026-10-20", amount: 110 }] }, /à vista não tem parcelas/],
    [{ categoryId: "" }, /categoria de receita/],
    [{ scheduledOn: "" }, /data do atendimento/],
    // Agendamento sem valor: serviços são opcionais, mas todo DAY precisa de ao
    // menos um entre título, cliente e serviço (noValueAppointments.test.ts).
    [{ clientId: "", services: [] }, /título, cliente ou serviço/],
    // Com valor, o cliente continua obrigatório.
    [{ clientId: "" }, /Selecione um cliente/],
    [{ title: "x".repeat(121) }, /120 caracteres/],
    [{ startAt: "2026-10-20T09:00" }, /./], // horario nao existe no fluxo por dia (strict)
  ])("recusa %j com 400 e nada é criado", async (overrides, message) => {
    const ctx = await login(tz);
    const created = await create(ctx, overrides);
    expect(created.status).toBe(400);
    expect(created.error).toMatch(message);
    expect(await prisma.appointment.count({ where: { businessId: ctx.businessId } })).toBe(0);
  });

  it("recusa categoria que não é de receita e serviço de outra empresa", async () => {
    const other = await login(tz);
    const ctx = await login(tz);
    expect((await create(ctx, { categoryId: expenseCategoryId })).status).toBe(400);
    const foreign = await create(ctx, { services: [{ productId: other.corteId, quantity: 1, unitPrice: 10 }] });
    expect([foreign.status, foreign.error]).toEqual([400, "Um ou mais serviços não foram encontrados."]);
  });

  it("editar só em AGENDADO: troca dia, serviços e pagamento; não altera autoCompleteEligible", async () => {
    const ctx = await login(tz);
    const { id } = await create(ctx);
    const res = await patchAgenda(
      json("PATCH", `http://test/api/agenda/${id}`, payload(ctx, {
        scheduledOn: "2026-10-25",
        services: [{ productId: ctx.corteId, quantity: 3, unitPrice: 40 }],
        paymentTiming: "APRAZO",
        installments: [{ dueOn: "2026-10-25", amount: 120 }],
      })),
      params(id!)
    );
    expect(res.status).toBe(200);
    let a = await row(id!);
    expect([dbDateToKey(a.scheduledOn!), a.paymentTiming, a.autoCompleteEligible]).toEqual(["2026-10-25", "APRAZO", true]);
    expect(a.services.map((s) => [s.nameSnapshot, s.quantity, s.unitPrice?.toString()])).toEqual([["Corte", 3, "40"]]);
    expect(a.installments.map((i) => [dbDateToKey(i.dueOn), i.amount.toString()])).toEqual([["2026-10-25", "120"]]);

    // Cancelado (e reaberto): a edicao continua sem mexer na elegibilidade.
    expect((await setStatus(id!, "CANCELADO")).status).toBe(200);
    const blocked = await patchAgenda(json("PATCH", `http://test/api/agenda/${id}`, payload(ctx)), params(id!));
    expect([blocked.status, ((await blocked.json()) as { error: string }).error]).toEqual([400, "Só é possível editar agendamentos com status Agendado."]);
    a = await row(id!);
    expect([a.status, dbDateToKey(a.scheduledOn!)]).toEqual(["CANCELADO", "2026-10-25"]);
  });

  it("cancelar, faltar e reabrir tiram da conclusão automática; CONFIRMADO não existe; falta só a partir do dia", async () => {
    const ctx = await login(tz);
    const future = addDays(ctx.today, 3);
    const { id } = await create(ctx, { scheduledOn: future });
    expect((await setStatus(id!, "CONFIRMADO")).status).toBe(400);
    expect((await setStatus(id!, "FALTOU")).status).toBe(400);
    expect((await row(id!)).autoCompleteEligible).toBe(true);
    expect((await setStatus(id!, "CANCELADO")).status).toBe(200);
    expect((await setStatus(id!, "AGENDADO")).status).toBe(200);
    let a = await row(id!);
    expect([a.status, a.autoCompleteEligible]).toEqual(["AGENDADO", false]);

    const { id: todayId } = await create(ctx, { scheduledOn: ctx.today });
    expect((await setStatus(todayId!, "FALTOU")).status).toBe(200);
    a = await row(todayId!);
    expect([a.status, a.autoCompleteEligible]).toEqual(["FALTOU", false]);
  });

  it("concluir agora: venda e lançamento à vista no dia do atendimento; antes do dia, recusa", async () => {
    const ctx = await login(tz);
    const { id } = await create(ctx);
    const res = await postComplete(json("POST", `http://test/api/agenda/${id}/complete`), params(id!));
    expect(res.status).toBe(200);
    const result = (await res.json()) as { saleId: string; alreadyCompleted: boolean };
    expect(result.alreadyCompleted).toBe(false);
    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: result.saleId }, include: { bills: { include: { financialEntry: true } } } });
    expect([dbDateToKey(sale.saleOn), sale.total.toString(), sale.categoryId, sale.paymentMethod, sale.appointmentId]).toEqual([
      "2026-10-20", "110", serviceRevenueCategoryId, "PIX", id,
    ]);
    expect(dbDateToKey(sale.bills[0].financialEntry!.occurredOn)).toBe("2026-10-20");
    expect((await row(id!)).status).toBe("CONCLUIDO");

    const { id: futureId } = await create(ctx, { scheduledOn: addDays(ctx.today, 1) });
    const early = await postComplete(json("POST", `http://test/api/agenda/${futureId}/complete`), params(futureId!));
    expect([early.status, ((await early.json()) as { error: string }).error]).toEqual([400, "Só é possível concluir um atendimento a partir do dia dele."]);
  });
});
