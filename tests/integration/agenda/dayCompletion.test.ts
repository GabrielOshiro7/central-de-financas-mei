import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma, type PaymentTiming } from "@prisma/client";
import { prisma } from "@/lib/db";
import { completeDayAppointment, dayCompletionRequestId } from "@/lib/agenda/dayCompletion";
import { changeAppointmentStatus, completeAppointment, createAppointment } from "@/lib/agenda/mutations";
import { clockFor, dateKeyToDbDate, dbDateToKey, zonedInstant } from "@/lib/time/zoned";

// Agenda A2: nucleo da conclusao do fluxo DAY (completeDayAppointment). Os
// agendamentos DAY sao gravados direto no banco (a criacao DAY e de outra
// etapa), com os campos que a criacao vai gravar: dia, categoria, pagamento,
// servicos com preco snapshot, parcelas planejadas e autoCompleteEligible.
const { Decimal } = Prisma;
const created: { userId: string; businessId: string }[] = [];
let revenueCategoryId: string;

async function newBusiness(timezone: string) {
  const user = await prisma.user.create({
    data: { name: "Teste A2", email: `a2-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "x" },
  });
  const business = await prisma.business.create({ data: { userId: user.id, name: `Empresa A2 ${timezone}`, currency: "BRL", timezone } });
  created.push({ userId: user.id, businessId: business.id });
  const client = await prisma.client.create({ data: { businessId: business.id, name: "Cliente A2" } });
  const [corte, barba] = await Promise.all([
    prisma.product.create({ data: { businessId: business.id, name: "Corte", type: "SERVICO", durationMinutes: 30, defaultPrice: new Decimal(50) } }),
    prisma.product.create({ data: { businessId: business.id, name: "Barba", type: "SERVICO", durationMinutes: 20, defaultPrice: new Decimal(30) } }),
  ]);
  return { userId: user.id, businessId: business.id, clientId: client.id, corteId: corte.id, barbaId: barba.id };
}

type Biz = Awaited<ReturnType<typeof newBusiness>>;

async function dayAppointment(
  biz: Biz,
  opts: {
    scheduledOn: string;
    paymentTiming: PaymentTiming;
    prices: [number, number]; // corte, barba (preco snapshot editado na criacao)
    installments?: { dueOn: string; amount: number }[];
  }
) {
  return prisma.appointment.create({
    data: {
      businessId: biz.businessId,
      clientId: biz.clientId,
      kind: "DAY",
      scheduledOn: dateKeyToDbDate(opts.scheduledOn),
      categoryId: revenueCategoryId,
      paymentTiming: opts.paymentTiming,
      paymentMethod: "PIX",
      autoCompleteEligible: true,
      services: {
        create: [
          { productId: biz.corteId, nameSnapshot: "Corte", unitPrice: new Decimal(opts.prices[0]), position: 0 },
          { productId: biz.barbaId, nameSnapshot: "Barba", unitPrice: new Decimal(opts.prices[1]), position: 1 },
        ],
      },
      installments: {
        create: (opts.installments ?? []).map((i, position) => ({ position, dueOn: dateKeyToDbDate(i.dueOn), amount: new Decimal(i.amount) })),
      },
    },
  });
}

async function saleOf(saleId: string) {
  return prisma.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: { items: { orderBy: { unitPrice: "desc" } }, bills: { orderBy: { dueOn: "asc" }, include: { financialEntry: true } } },
  });
}

beforeAll(async () => {
  revenueCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE", name: "Venda de produtos" } })).id;
});

afterAll(async () => {
  const ids = created.map((c) => c.businessId);
  await prisma.appointment.updateMany({ where: { businessId: { in: ids } }, data: { saleId: null } });
  await prisma.financialEntry.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.bill.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.sale.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.appointment.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.product.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.client.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: created.map((c) => c.userId) } } });
});

describe.each(["Asia/Tokyo", "America/Sao_Paulo"] as const)("completeDayAppointment - empresa em %s", (tz) => {
  // 12:00 de 22/10 no fuso da empresa: dois dias depois do atendimento.
  const clock = clockFor({ timezone: tz }, zonedInstant(tz, 2026, 10, 22, 12, 0));

  it("à vista: venda no dia do atendimento, parcela paga e lançamento no dia do atendimento", async () => {
    const biz = await newBusiness(tz);
    const appt = await dayAppointment(biz, { scheduledOn: "2026-10-20", paymentTiming: "AVISTA", prices: [60, 25] });

    const result = await completeDayAppointment(biz.businessId, appt.id, clock);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.alreadyCompleted).toBe(false);

    const sale = await saleOf(result.value.saleId!);
    expect(dbDateToKey(sale.saleOn)).toBe("2026-10-20");
    expect(sale.total.toString()).toBe("85");
    expect(sale.items.map((i) => [i.description, i.unitPrice.toString(), i.quantity.toString()])).toEqual([["Corte", "60", "1"], ["Barba", "25", "1"]]);
    expect([sale.status, sale.categoryId, sale.paymentMethod, sale.userId, sale.clientId]).toEqual(["CONFIRMED", revenueCategoryId, "PIX", biz.userId, biz.clientId]);
    expect(sale.appointmentId).toBe(appt.id);
    expect(sale.clientRequestId).toBe(dayCompletionRequestId(appt.id, 0));
    expect(sale.bills).toHaveLength(1);
    const [bill] = sale.bills;
    expect([bill.status, dbDateToKey(bill.dueOn), dbDateToKey(bill.paidOn!), bill.amount.toString()]).toEqual(["PAID", "2026-10-20", "2026-10-20", "85"]);
    expect(bill.paidAt).not.toBeNull(); // instante de auditoria
    expect(dbDateToKey(bill.financialEntry!.occurredOn)).toBe("2026-10-20");
    expect(bill.financialEntry!.amount.toString()).toBe("85");

    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect([after.status, after.saleId, after.completedAt?.toISOString()]).toEqual(["CONCLUIDO", sale.id, clock.now.toISOString()]);
  });

  it("a prazo: venda no dia do atendimento, parcelas com os vencimentos gravados, nada recebido", async () => {
    const biz = await newBusiness(tz);
    const appt = await dayAppointment(biz, {
      scheduledOn: "2026-10-20",
      paymentTiming: "APRAZO",
      prices: [200, 100],
      installments: [{ dueOn: "2026-11-20", amount: 100 }, { dueOn: "2026-12-20", amount: 200 }],
    });

    const result = await completeDayAppointment(biz.businessId, appt.id, clock);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sale = await saleOf(result.value.saleId!);
    expect(dbDateToKey(sale.saleOn)).toBe("2026-10-20");
    expect(sale.total.toString()).toBe("300");
    expect(sale.bills.map((b) => [b.status, dbDateToKey(b.dueOn), b.amount.toString(), b.paidOn])).toEqual([
      ["PENDING", "2026-11-20", "100", null],
      ["PENDING", "2026-12-20", "200", null],
    ]);
    expect(await prisma.financialEntry.count({ where: { businessId: biz.businessId } })).toBe(0);
  });

  it("valor total zero: conclui SEM venda; chamar de novo devolve a mesma conclusão", async () => {
    const biz = await newBusiness(tz);
    const appt = await dayAppointment(biz, { scheduledOn: "2026-10-20", paymentTiming: "AVISTA", prices: [0, 0] });

    const first = await completeDayAppointment(biz.businessId, appt.id, clock);
    expect(first).toEqual({ ok: true, value: { id: appt.id, saleId: null, saleNumber: null, alreadyCompleted: false } });
    const second = await completeDayAppointment(biz.businessId, appt.id, clock);
    expect(second).toEqual({ ok: true, value: { id: appt.id, saleId: null, saleNumber: null, alreadyCompleted: true } });

    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect([after.status, after.saleId]).toEqual(["CONCLUIDO", null]);
    expect(await prisma.sale.count({ where: { businessId: biz.businessId } })).toBe(0);
    expect(await prisma.bill.count({ where: { businessId: biz.businessId } })).toBe(0);
  });

  it("chamada duas vezes: uma única venda", async () => {
    const biz = await newBusiness(tz);
    const appt = await dayAppointment(biz, { scheduledOn: "2026-10-21", paymentTiming: "AVISTA", prices: [50, 30] });

    const first = await completeDayAppointment(biz.businessId, appt.id, clock);
    const second = await completeDayAppointment(biz.businessId, appt.id, clock);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value).toEqual({ ...first.value, alreadyCompleted: true });
    expect(await prisma.sale.count({ where: { businessId: biz.businessId } })).toBe(1);
    expect(await prisma.financialEntry.count({ where: { businessId: biz.businessId } })).toBe(1);
  });

  it("duas chamadas concorrentes: uma única venda, a outra devolve a conclusão existente", async () => {
    const biz = await newBusiness(tz);
    const appt = await dayAppointment(biz, { scheduledOn: "2026-10-21", paymentTiming: "AVISTA", prices: [50, 30] });

    const results = await Promise.all([
      completeDayAppointment(biz.businessId, appt.id, clock),
      completeDayAppointment(biz.businessId, appt.id, clock),
      completeDayAppointment(biz.businessId, appt.id, clock),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    const values = results.map((r) => (r.ok ? r.value : null)!);
    expect(new Set(values.map((v) => v.saleId)).size).toBe(1);
    expect(values.filter((v) => !v.alreadyCompleted)).toHaveLength(1);
    expect(await prisma.sale.count({ where: { businessId: biz.businessId } })).toBe(1);
    expect(await prisma.bill.count({ where: { businessId: biz.businessId } })).toBe(1);
    expect(await prisma.financialEntry.count({ where: { businessId: biz.businessId } })).toBe(1);
  });

  it("antes do dia do atendimento (no fuso da empresa): recusa e nada muda", async () => {
    const biz = await newBusiness(tz);
    const appt = await dayAppointment(biz, { scheduledOn: "2026-10-23", paymentTiming: "AVISTA", prices: [50, 30] });
    const result = await completeDayAppointment(biz.businessId, appt.id, clock);
    expect(result).toEqual({ ok: false, error: "Só é possível concluir um atendimento a partir do dia dele." });
    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect([after.status, after.saleId, after.completedAt]).toEqual(["AGENDADO", null, null]);
  });

  it("reconclusão depois de um desfazer (completionSeq): venda NOVA, a cancelada não é reaproveitada", async () => {
    const biz = await newBusiness(tz);
    const appt = await dayAppointment(biz, { scheduledOn: "2026-10-20", paymentTiming: "AVISTA", prices: [50, 30] });
    const first = await completeDayAppointment(biz.businessId, appt.id, clock);
    if (!first.ok) throw new Error(first.error);

    // Simula o efeito de um Desfazer (outra etapa): venda cancelada, status de
    // volta, contador incrementado, nunca mais elegivel ao automatico.
    await prisma.$transaction([
      prisma.financialEntry.deleteMany({ where: { businessId: biz.businessId } }),
      prisma.bill.updateMany({ where: { saleId: first.value.saleId! }, data: { status: "CANCELLED" } }),
      prisma.sale.update({ where: { id: first.value.saleId! }, data: { status: "CANCELLED" } }),
      prisma.appointment.update({
        where: { id: appt.id },
        data: { status: "AGENDADO", saleId: null, completedAt: null, completionSeq: { increment: 1 }, autoCompleteEligible: false },
      }),
    ]);

    const again = await completeDayAppointment(biz.businessId, appt.id, clock);
    if (!again.ok) throw new Error(again.error);
    expect(again.value.saleId).not.toBe(first.value.saleId);
    const sale = await saleOf(again.value.saleId!);
    expect([sale.status, sale.clientRequestId, sale.appointmentId]).toEqual(["CONFIRMED", dayCompletionRequestId(appt.id, 1), appt.id]);
    const old = await prisma.sale.findUniqueOrThrow({ where: { id: first.value.saleId! } });
    expect([old.status, old.appointmentId]).toEqual(["CANCELLED", appt.id]); // o rastro fica na venda cancelada
  });
});

describe("fuso da empresa decide 'hoje'", () => {
  it("23:30 de 20/10 em São Paulo (= 21/10 em Tóquio): atendimento de 21/10 só conclui na empresa de Tóquio", async () => {
    const instant = new Date("2026-10-21T02:30:00Z");
    const sp = await newBusiness("America/Sao_Paulo");
    const tokyo = await newBusiness("Asia/Tokyo");
    const spAppt = await dayAppointment(sp, { scheduledOn: "2026-10-21", paymentTiming: "AVISTA", prices: [50, 30] });
    const tokyoAppt = await dayAppointment(tokyo, { scheduledOn: "2026-10-21", paymentTiming: "AVISTA", prices: [50, 30] });

    const spResult = await completeDayAppointment(sp.businessId, spAppt.id, clockFor({ timezone: "America/Sao_Paulo" }, instant));
    expect(spResult.ok).toBe(false);
    const tokyoResult = await completeDayAppointment(tokyo.businessId, tokyoAppt.id, clockFor({ timezone: "Asia/Tokyo" }, instant));
    expect(tokyoResult.ok).toBe(true);
    if (!tokyoResult.ok) return;
    expect(dbDateToKey((await saleOf(tokyoResult.value.saleId!)).saleOn)).toBe("2026-10-21");
  });
});

describe("fluxo TIMED (antigo) inalterado e separado do DAY", () => {
  it("conclusão TIMED continua igual (clientRequestId 'agenda:<id>', sem rastro) e completeDayAppointment recusa TIMED", async () => {
    const biz = await newBusiness("Asia/Tokyo");
    const timed = await createAppointment(biz.businessId, { clientId: biz.clientId, startAt: new Date("2026-06-01T01:00:00Z"), services: [{ productId: biz.corteId }] });
    if (!timed.ok) throw new Error(timed.error);
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: timed.value.id } });
    expect([row.kind, row.autoCompleteEligible, row.completionSeq, row.scheduledOn, row.categoryId, row.paymentTiming]).toEqual(["TIMED", false, 0, null, null, null]);

    const refused = await completeDayAppointment(biz.businessId, timed.value.id, clockFor({ timezone: "Asia/Tokyo" }, new Date("2026-06-02T00:00:00Z")));
    expect(refused).toEqual({ ok: false, error: "Este agendamento não é do fluxo por dia." });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: timed.value.id } })).status).toBe("AGENDADO");

    const done = await completeAppointment(biz.businessId, biz.userId, timed.value.id, {
      categoryId: revenueCategoryId,
      items: [{ productId: biz.corteId, description: "Corte", quantity: 1, unitPrice: 50 }],
      installments: [{ dueDate: "2026-06-01", amount: 50, paidNow: true }],
    }, "Asia/Tokyo");
    if (!done.ok) throw new Error(done.error);
    const sale = await saleOf(done.value.saleId);
    expect([sale.clientRequestId, sale.appointmentId, dbDateToKey(sale.saleOn)]).toEqual([`agenda:${timed.value.id}`, null, "2026-06-01"]);
  });

  it("completeAppointment (TIMED) recusa um agendamento DAY", async () => {
    const biz = await newBusiness("Asia/Tokyo");
    const appt = await dayAppointment(biz, { scheduledOn: "2026-10-20", paymentTiming: "AVISTA", prices: [50, 30] });
    const result = await completeAppointment(biz.businessId, biz.userId, appt.id, {
      categoryId: revenueCategoryId,
      items: [{ productId: biz.corteId, description: "Corte", quantity: 1, unitPrice: 80 }],
      installments: [{ dueDate: "2026-10-20", amount: 80, paidNow: true }],
    }, "Asia/Tokyo");
    expect(result.ok).toBe(false);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe("AGENDADO");
  });
});

describe("autoCompleteEligible e transições DAY (decisões 4 e 7)", () => {
  it("cancelar e reabrir tiram da conclusão automática para sempre; CONFIRMADO não existe no fluxo DAY", async () => {
    const biz = await newBusiness("Asia/Tokyo");
    const future = new Date().getUTCFullYear() + 1 + "-01-15";
    const appt = await dayAppointment(biz, { scheduledOn: future, paymentTiming: "AVISTA", prices: [50, 30] });

    expect(await changeAppointmentStatus(biz.businessId, appt.id, "CONFIRMADO")).toEqual({
      ok: false,
      error: "Não é possível mudar o status de AGENDADO para CONFIRMADO.",
    });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).autoCompleteEligible).toBe(true);

    expect((await changeAppointmentStatus(biz.businessId, appt.id, "FALTOU")).ok).toBe(false); // dia ainda nao chegou
    expect((await changeAppointmentStatus(biz.businessId, appt.id, "CANCELADO")).ok).toBe(true);
    let row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect([row.status, row.autoCompleteEligible]).toEqual(["CANCELADO", false]);

    expect((await changeAppointmentStatus(biz.businessId, appt.id, "AGENDADO")).ok).toBe(true);
    row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect([row.status, row.autoCompleteEligible]).toEqual(["AGENDADO", false]); // reaberto, mas nunca mais elegivel
  });

  it("CHECK do banco: DAY sem dia/categoria/pagamento, TIMED sem horário e TIMED elegível são recusados", async () => {
    const biz = await newBusiness("Asia/Tokyo");
    await expect(prisma.appointment.create({ data: { businessId: biz.businessId, clientId: biz.clientId, kind: "DAY" } })).rejects.toThrow();
    await expect(prisma.appointment.create({ data: { businessId: biz.businessId, clientId: biz.clientId } })).rejects.toThrow();
    await expect(
      prisma.appointment.create({
        data: { businessId: biz.businessId, clientId: biz.clientId, startAt: new Date(), endAt: new Date(Date.now() + 60_000), autoCompleteEligible: true },
      })
    ).rejects.toThrow();
  });
});
