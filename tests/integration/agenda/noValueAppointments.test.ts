import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { POST as postAgenda } from "@/app/api/agenda/route";
import { PATCH as patchAgenda } from "@/app/api/agenda/[id]/route";
import { POST as postStatus } from "@/app/api/agenda/[id]/status/route";
import { POST as postComplete } from "@/app/api/agenda/[id]/complete/route";
import { autoCompleteDueAppointments } from "@/lib/agenda/autoComplete";
import { undoAppointmentCompletion } from "@/lib/agenda/undoCompletion";
import { getClientAppointmentHistory, isNoValueAppointment, listAgendaForDay, summarizeAgenda } from "@/lib/agenda/queries";
import { createTimedAppointment } from "../../helpers/timedAppointment";
import { completeAppointment, updateAppointment } from "@/lib/agenda/mutations";
import { addDays, clockFor, startOfDayInstant, todayKey } from "@/lib/time/zoned";

// Agendamento DAY SEM VALOR (ex.: reuniao): total zero => categoria, pagamento
// e parcelas nao sao exigidos nem gravados; cliente e servicos opcionais; todo
// DAY precisa de ao menos um entre titulo, cliente e servico. Pelas rotas (como
// a tela chama), mais conclusao automatica, desfazer e as CHECKs do banco.
const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string } }));
vi.mock("@/lib/auth/cookies", () => ({ getCurrentUser: async () => session.user }));

const { Decimal } = Prisma;
const createdUserIds: string[] = [];
let revenueCategoryId: string;
const TZ = "Asia/Tokyo";

async function login() {
  const user = await prisma.user.create({
    data: { name: "Teste SV", email: `sv-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "x" },
  });
  createdUserIds.push(user.id);
  const business = await prisma.business.create({ data: { userId: user.id, name: "Empresa SV", currency: "BRL", timezone: TZ } });
  session.user = { id: user.id, name: user.name, email: user.email };
  const client = await prisma.client.create({ data: { businessId: business.id, name: "Cliente SV" } });
  const [corte, brinde] = await Promise.all([
    prisma.product.create({ data: { businessId: business.id, name: "Corte", type: "SERVICO", defaultPrice: new Decimal(60) } }),
    prisma.product.create({ data: { businessId: business.id, name: "Cortesia", type: "SERVICO", defaultPrice: new Decimal(0) } }),
  ]);
  return {
    userId: user.id,
    businessId: business.id,
    clientId: client.id,
    corteId: corte.id,
    brindeId: brinde.id,
    today: todayKey(clockFor({ timezone: TZ })),
  };
}

type Ctx = Awaited<ReturnType<typeof login>>;

const json = (method: string, url: string, body?: unknown) =>
  new Request(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

// Payload COM valor (como o formulario manda): cliente, categoria e pagamento.
function paidPayload(ctx: Ctx, overrides: Record<string, unknown> = {}) {
  return {
    clientId: ctx.clientId,
    scheduledOn: "2026-10-20",
    services: [{ productId: ctx.corteId, quantity: 1, unitPrice: 60 }],
    categoryId: revenueCategoryId,
    paymentTiming: "APRAZO",
    paymentMethod: "PIX",
    installments: [{ dueOn: "2026-11-20", amount: 60 }],
    ...overrides,
  };
}

async function post(body: unknown) {
  const res = await postAgenda(json("POST", "http://test/api/agenda", body));
  return { status: res.status, ...((await res.json()) as { id?: string; error?: string }) };
}
async function patch(id: string, body: unknown) {
  const res = await patchAgenda(json("PATCH", `http://test/api/agenda/${id}`, body), params(id));
  return { status: res.status, ...((await res.json()) as { error?: string }) };
}
async function setStatus(id: string, status: string) {
  const res = await postStatus(json("POST", `http://test/api/agenda/${id}/status`, { status }), params(id));
  return { status: res.status, ...((await res.json()) as { error?: string }) };
}
async function row(id: string) {
  return prisma.appointment.findUniqueOrThrow({ where: { id }, include: { services: true, installments: true } });
}
const salesOf = (businessId: string) => prisma.sale.count({ where: { businessId } });

beforeAll(async () => {
  revenueCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE", name: "Venda de serviços" } })).id;
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

describe("criar sem valor", () => {
  it("só com título (sem cliente e sem serviço): grava DAY com categoria/pagamento/parcelas nulos", async () => {
    const ctx = await login();
    const created = await post({ title: "Reunião com contador", scheduledOn: "2026-10-20" });
    expect(created.status).toBe(201);
    const a = await row(created.id!);
    expect([a.kind, a.status, a.title, a.clientId, a.categoryId, a.paymentTiming, a.paymentMethod, a.autoCompleteEligible]).toEqual([
      "DAY", "AGENDADO", "Reunião com contador", null, null, null, null, true,
    ]);
    expect([a.services.length, a.installments.length, a.startAt, a.endAt]).toEqual([0, 0, null, null]);
    expect(isNoValueAppointment(a)).toBe(true);
    expect(await salesOf(ctx.businessId)).toBe(0);
  });

  it("só com cliente", async () => {
    const ctx = await login();
    const created = await post({ clientId: ctx.clientId, scheduledOn: "2026-10-20" });
    expect(created.status).toBe(201);
    const a = await row(created.id!);
    expect([a.clientId, a.title, a.categoryId, a.paymentTiming]).toEqual([ctx.clientId, null, null, null]);
  });

  it("só com serviço de valor 0 (sem cliente nem título)", async () => {
    const ctx = await login();
    const created = await post({ scheduledOn: "2026-10-20", services: [{ productId: ctx.brindeId, quantity: 2, unitPrice: 0 }] });
    expect(created.status).toBe(201);
    const a = await row(created.id!);
    expect([a.clientId, a.title, a.categoryId, a.paymentTiming, a.services.map((s) => s.unitPrice?.toString())]).toEqual([null, null, null, null, ["0"]]);
  });

  it("recusa sem cliente, serviço e título (e título só de espaços)", async () => {
    const ctx = await login();
    for (const body of [{ scheduledOn: "2026-10-20" }, { scheduledOn: "2026-10-20", title: "   " }, { scheduledOn: "2026-10-20", clientId: "", services: [] }]) {
      const res = await post(body);
      expect([res.status, res.error]).toEqual([400, "Informe ao menos um título, cliente ou serviço."]);
    }
    expect(await prisma.appointment.count({ where: { businessId: ctx.businessId } })).toBe(0);
  });

  it("sem valor NÃO grava categoria/pagamento/parcelas mesmo que venham no corpo", async () => {
    const ctx = await login();
    const created = await post(paidPayload(ctx, { services: [{ productId: ctx.brindeId, quantity: 1, unitPrice: 0 }], installments: [{ dueOn: "2026-11-20", amount: 10 }] }));
    expect(created.status).toBe(201);
    const a = await row(created.id!);
    expect([a.categoryId, a.paymentTiming, a.paymentMethod, a.installments.length]).toEqual([null, null, null, 0]);
  });

  it("recusa cliente de outra empresa mesmo sem valor", async () => {
    const other = await login();
    const ctx = await login();
    const res = await post({ clientId: other.clientId, scheduledOn: "2026-10-20" });
    expect(res.status).toBe(400);
    expect(await prisma.appointment.count({ where: { businessId: ctx.businessId } })).toBe(0);
  });
});

describe("com valor continua exigindo tudo", () => {
  it.each([
    [{ clientId: "" }, /Selecione um cliente/],
    [{ clientId: undefined }, /Selecione um cliente/],
    [{ categoryId: "" }, /categoria de receita/],
    [{ categoryId: undefined }, /categoria de receita/],
    [{ paymentTiming: undefined }, /condição de pagamento/],
    [{ paymentTiming: "APRAZO", installments: [] }, /ao menos uma parcela/],
  ])("recusa %j", async (overrides, message) => {
    const ctx = await login();
    const res = await post(paidPayload(ctx, { title: "Com título", ...overrides }));
    expect(res.status).toBe(400);
    expect(res.error).toMatch(message);
    expect(await prisma.appointment.count({ where: { businessId: ctx.businessId } })).toBe(0);
  });

  it("com valor grava cliente, título, categoria, pagamento e parcelas", async () => {
    const ctx = await login();
    const created = await post(paidPayload(ctx, { title: "Corte + conversa" }));
    expect(created.status).toBe(201);
    const a = await row(created.id!);
    expect([a.title, a.clientId, a.categoryId, a.paymentTiming, a.paymentMethod, a.installments.length]).toEqual([
      "Corte + conversa", ctx.clientId, revenueCategoryId, "APRAZO", "PIX", 1,
    ]);
  });
});

describe("editar", () => {
  it("de com valor para sem valor: limpa categoria, pagamento, meio e parcelas (cliente e título ficam)", async () => {
    const ctx = await login();
    const { id } = await post(paidPayload(ctx, { title: "Antes" }));
    const res = await patch(id!, { clientId: ctx.clientId, title: "Agora é reunião", scheduledOn: "2026-10-20", services: [] });
    expect(res.status).toBe(200);
    const a = await row(id!);
    expect([a.title, a.clientId, a.categoryId, a.paymentTiming, a.paymentMethod, a.services.length, a.installments.length]).toEqual([
      "Agora é reunião", ctx.clientId, null, null, null, 0, 0,
    ]);
  });

  it("de sem valor para com valor: passa a exigir cliente, categoria e pagamento", async () => {
    const ctx = await login();
    const { id } = await post({ title: "Reunião", scheduledOn: "2026-10-20" });
    const incomplete = await patch(id!, { title: "Reunião", scheduledOn: "2026-10-20", services: [{ productId: ctx.corteId, quantity: 1, unitPrice: 60 }] });
    expect([incomplete.status, incomplete.error]).toEqual([400, "Selecione um cliente."]);
    expect((await row(id!)).categoryId).toBeNull(); // nada mudou

    const ok = await patch(id!, paidPayload(ctx, { title: "Reunião" }));
    expect(ok.status).toBe(200);
    const a = await row(id!);
    expect([a.clientId, a.categoryId, a.paymentTiming, a.installments.length, a.services.length]).toEqual([ctx.clientId, revenueCategoryId, "APRAZO", 1, 1]);
  });

  it("remover o cliente de um agendamento sem valor", async () => {
    const ctx = await login();
    const { id } = await post({ clientId: ctx.clientId, title: "Reunião", scheduledOn: "2026-10-20" });
    expect((await patch(id!, { title: "Reunião", scheduledOn: "2026-10-20" })).status).toBe(200);
    expect((await row(id!)).clientId).toBeNull();
  });
});

describe("concluir e desfazer", () => {
  it("manual: conclui SEM venda (sem categoria/pagamento/cliente), idempotente", async () => {
    const ctx = await login();
    const { id } = await post({ title: "Reunião", scheduledOn: ctx.today });
    const res = await postComplete(json("POST", `http://test/api/agenda/${id}/complete`), params(id!));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ saleId: null, saleNumber: null, alreadyCompleted: false });
    const a = await row(id!);
    expect([a.status, a.saleId, a.completedAt === null]).toEqual(["CONCLUIDO", null, false]);
    expect(await salesOf(ctx.businessId)).toBe(0);

    const again = await postComplete(json("POST", `http://test/api/agenda/${id}/complete`), params(id!));
    expect(await again.json()).toMatchObject({ saleId: null, alreadyCompleted: true });
  });

  it("antes do dia: recusa, como qualquer DAY", async () => {
    const ctx = await login();
    const { id } = await post({ title: "Reunião", scheduledOn: addDays(ctx.today, 2) });
    const res = await postComplete(json("POST", `http://test/api/agenda/${id}/complete`), params(id!));
    expect(res.status).toBe(400);
  });

  it("automática: o dia terminou => conclui sem venda e sem falha", async () => {
    const ctx = await login();
    const { id } = await post({ title: "Reunião de ontem", scheduledOn: addDays(ctx.today, -1) });
    const result = await autoCompleteDueAppointments(ctx.businessId, clockFor({ timezone: TZ }));
    expect(result).toMatchObject({ completed: 1, failed: 0 });
    const a = await row(id!);
    expect([a.status, a.saleId]).toEqual(["CONCLUIDO", null]);
    expect(await salesOf(ctx.businessId)).toBe(0);
  });

  it("desfazer: só muda o status e nunca cria/cancela venda", async () => {
    const ctx = await login();
    const { id } = await post({ title: "Reunião", scheduledOn: ctx.today });
    await postComplete(json("POST", `http://test/api/agenda/${id}/complete`), params(id!));
    const undone = await undoAppointmentCompletion(ctx.businessId, id!, "AGENDADO");
    expect(undone).toEqual({ ok: true, value: { id, cancelledSaleId: null, reversedAmount: "0" } });
    const a = await row(id!);
    expect([a.status, a.completedAt, a.autoCompleteEligible, a.completionSeq]).toEqual(["AGENDADO", null, false, 1]);
    expect(await salesOf(ctx.businessId)).toBe(0);
  });

  it("cancelar, faltar e reabrir funcionam como nos demais DAY", async () => {
    const ctx = await login();
    const { id } = await post({ title: "Reunião", scheduledOn: ctx.today });
    expect((await setStatus(id!, "FALTOU")).status).toBe(200);
    expect((await setStatus(id!, "AGENDADO")).status).toBe(200);
    expect((await setStatus(id!, "CANCELADO")).status).toBe(200);
    expect((await row(id!)).status).toBe("CANCELADO");
  });

  it("com valor continua gerando venda ao concluir (regressão)", async () => {
    const ctx = await login();
    const { id } = await post(paidPayload(ctx, { scheduledOn: ctx.today, paymentTiming: "AVISTA", installments: [] }));
    const res = await postComplete(json("POST", `http://test/api/agenda/${id}/complete`), params(id!));
    const body = (await res.json()) as { saleId: string | null };
    expect(body.saleId).not.toBeNull();
    expect(await salesOf(ctx.businessId)).toBe(1);
  });
});

describe("telas: totais e histórico", () => {
  it("o dia soma valor normalmente (sem valor = 0) e a contagem inclui todos os não cancelados/faltas", async () => {
    const ctx = await login();
    await post({ title: "Reunião", scheduledOn: "2026-10-20" });
    await post(paidPayload(ctx, { installments: [{ dueOn: "2026-11-20", amount: 60 }] }));
    const cancelled = await post({ title: "Cancelada", scheduledOn: "2026-10-20" });
    await setStatus(cancelled.id!, "CANCELADO");

    const entries = await listAgendaForDay(ctx.businessId, "2026-10-20", TZ);
    expect(entries).toHaveLength(3);
    const totals = summarizeAgenda(entries);
    expect([totals.count, totals.amount.toString()]).toEqual([2, "60"]);
    expect(entries.filter((e) => isNoValueAppointment(e)).map((e) => e.title).sort()).toEqual(["Cancelada", "Reunião"]);
    expect(entries.find((e) => e.title === "Reunião")?.client).toBeNull();
  });

  it("histórico do cliente traz o sem valor com título e marca noValue", async () => {
    const ctx = await login();
    await post({ clientId: ctx.clientId, title: "Alinhamento", scheduledOn: "2026-10-21" });
    await post(paidPayload(ctx, { scheduledOn: "2026-10-22" }));
    const history = await getClientAppointmentHistory(ctx.businessId, ctx.clientId, TZ);
    expect(history.map((h) => [h.dayKey, h.title, h.noValue])).toEqual([
      ["2026-10-22", null, false],
      ["2026-10-21", "Alinhamento", true],
    ]);
  });
});

describe("CHECKs do banco (invariantes de linha)", () => {
  async function insert(ctx: Ctx, data: Record<string, unknown>) {
    return prisma.appointment.create({ data: { businessId: ctx.businessId, ...data } as Prisma.AppointmentUncheckedCreateInput });
  }
  const day = { kind: "DAY" as const, scheduledOn: new Date("2026-10-20T00:00:00Z") };

  it("categoria e pagamento: ou ambos nulos ou ambos preenchidos", async () => {
    const ctx = await login();
    await expect(insert(ctx, { ...day, categoryId: revenueCategoryId })).rejects.toThrow(/appointments_payment_coherence_check/);
    await expect(insert(ctx, { ...day, paymentTiming: "AVISTA" })).rejects.toThrow(/appointments_payment_coherence_check/);
    await expect(insert(ctx, { ...day, categoryId: revenueCategoryId, paymentTiming: "AVISTA" })).resolves.toBeTruthy();
    await expect(insert(ctx, { ...day, title: "só título" })).resolves.toBeTruthy();
  });

  it("DAY exige o dia; TIMED exige cliente e horário (inalterado)", async () => {
    const ctx = await login();
    await expect(insert(ctx, { kind: "DAY", title: "sem dia" })).rejects.toThrow(/appointments_day_fields_check/);
    const start = new Date("2026-10-20T01:00:00Z");
    await expect(insert(ctx, { kind: "TIMED", startAt: start, endAt: new Date(start.getTime() + 3_600_000) })).rejects.toThrow(/appointments_timed_client_check/);
    await expect(insert(ctx, { kind: "TIMED", clientId: ctx.clientId })).rejects.toThrow(/appointments_timed_fields_check/);
  });
});

describe("TIMED (legado) inalterado", () => {
  it("criar, editar e concluir um TIMED continuam como antes (cliente obrigatório, venda gerada)", async () => {
    const ctx = await login();
    const longo = await prisma.product.create({ data: { businessId: ctx.businessId, name: "Consulta", type: "SERVICO", durationMinutes: 30, defaultPrice: new Decimal(80) } });
    const startAt = new Date(startOfDayInstant(ctx.today, TZ).getTime() + 9 * 3_600_000);
    const created = await createTimedAppointment(ctx.businessId, { clientId: ctx.clientId, startAt, services: [{ productId: longo.id }] });
    if (!created.ok) throw new Error(created.error);
    const a = await row(created.value.id);
    expect([a.kind, a.clientId, a.title, a.categoryId, a.paymentTiming, a.autoCompleteEligible]).toEqual(["TIMED", ctx.clientId, null, null, null, false]);

    const edited = await updateAppointment(ctx.businessId, a.id, { clientId: ctx.clientId, startAt: new Date(startAt.getTime() + 3_600_000), services: [{ productId: longo.id }] });
    expect(edited.ok).toBe(true);

    const done = await completeAppointment(
      ctx.businessId,
      ctx.userId,
      a.id,
      { categoryId: revenueCategoryId, items: [{ productId: longo.id, description: "Consulta", quantity: 1, unitPrice: 80 }], installments: [{ dueDate: ctx.today, amount: 80, paidNow: true }] },
      TZ
    );
    expect(done.ok).toBe(true);
    expect(await salesOf(ctx.businessId)).toBe(1);
  });
});
