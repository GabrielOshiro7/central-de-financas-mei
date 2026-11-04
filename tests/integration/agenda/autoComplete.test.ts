import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import { Prisma, type AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { autoCompleteDueAppointments } from "@/lib/agenda/autoComplete";
import { undoAppointmentCompletion } from "@/lib/agenda/undoCompletion";
import { addDays, clockFor, dateKeyToDbDate, dbDateToKey, startOfDayInstant, type DateKey } from "@/lib/time/zoned";

// Agenda A5: conclusao automatica dos atendimentos DAY quando o dia termina
// no fuso da empresa. "Hoje" da empresa e controlado pelo relogio passado.
const { Decimal } = Prisma;
const createdUserIds: string[] = [];
let revenueCategoryId: string;

const TODAY: DateKey = "2026-06-10";

async function newBusiness(timezone: string) {
  const user = await prisma.user.create({
    data: { name: "Teste A5", email: `a5-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "x" },
  });
  createdUserIds.push(user.id);
  const business = await prisma.business.create({ data: { userId: user.id, name: `Empresa A5 ${timezone}`, currency: "BRL", timezone } });
  const client = await prisma.client.create({ data: { businessId: business.id, name: "Cliente A5" } });
  const product = await prisma.product.create({ data: { businessId: business.id, name: "Corte", type: "SERVICO", defaultPrice: new Decimal(70) } });
  return { businessId: business.id, timezone, clientId: client.id, productId: product.id };
}

type Biz = Awaited<ReturnType<typeof newBusiness>>;

// Meio-dia de `day` no fuso da empresa.
const noonOf = (biz: Biz, day: DateKey) => new Date(startOfDayInstant(day, biz.timezone).getTime() + 12 * 3_600_000);
const clockAt = (biz: Biz, now: Date) => clockFor({ timezone: biz.timezone }, now);

async function dayAppointment(
  biz: Biz,
  scheduledOn: DateKey,
  opts: { status?: AppointmentStatus; eligible?: boolean; unitPrice?: number | null } = {}
) {
  const appointment = await prisma.appointment.create({
    data: {
      businessId: biz.businessId,
      clientId: biz.clientId,
      kind: "DAY",
      status: opts.status ?? "AGENDADO",
      autoCompleteEligible: opts.eligible ?? true,
      scheduledOn: dateKeyToDbDate(scheduledOn),
      categoryId: revenueCategoryId,
      paymentTiming: "AVISTA",
      paymentMethod: "PIX",
      services: {
        create: [
          {
            productId: biz.productId,
            nameSnapshot: "Corte",
            unitPrice: opts.unitPrice === null ? null : new Decimal(opts.unitPrice ?? 70),
            quantity: 1,
            position: 0,
          },
        ],
      },
    },
  });
  return appointment.id;
}

const statusOf = async (id: string) => (await prisma.appointment.findUniqueOrThrow({ where: { id } })).status;
const salesOf = (appointmentId: string) => prisma.sale.findMany({ where: { appointmentId }, include: { bills: { include: { financialEntry: true } } } });

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

describe.each(["Asia/Tokyo", "America/Sao_Paulo"] as const)("conclusão automática - empresa em %s", (tz) => {
  it("o de ontem elegível é concluído na carga; o de hoje NÃO", async () => {
    const biz = await newBusiness(tz);
    const yesterday = await dayAppointment(biz, addDays(TODAY, -1));
    const today = await dayAppointment(biz, TODAY);

    const result = await autoCompleteDueAppointments(biz.businessId, clockAt(biz, noonOf(biz, TODAY)));
    expect(result).toEqual({ completed: 1, failed: 0, stoppedByTimeLimit: false });
    expect([await statusOf(yesterday), await statusOf(today)]).toEqual(["CONCLUIDO", "AGENDADO"]);
    expect(await salesOf(today)).toHaveLength(0);
  });

  it("virada exata no fuso da empresa: 23:59:59 do dia -> não; 00:00 do dia seguinte -> sim", async () => {
    const biz = await newBusiness(tz);
    const id = await dayAppointment(biz, TODAY);
    const midnight = startOfDayInstant(addDays(TODAY, 1), tz);

    const before = await autoCompleteDueAppointments(biz.businessId, clockAt(biz, new Date(midnight.getTime() - 1000)));
    expect(before.completed).toBe(0);
    expect(await statusOf(id)).toBe("AGENDADO");

    const after = await autoCompleteDueAppointments(biz.businessId, clockAt(biz, midnight));
    expect(after.completed).toBe(1);
    expect(await statusOf(id)).toBe("CONCLUIDO");
  });

  it("ignora inelegíveis, TIMED, cancelados, faltas e dias futuros", async () => {
    const biz = await newBusiness(tz);
    const past = addDays(TODAY, -2);
    const ineligible = await dayAppointment(biz, past, { eligible: false });
    const cancelled = await dayAppointment(biz, past, { status: "CANCELADO", eligible: false });
    const noShow = await dayAppointment(biz, past, { status: "FALTOU", eligible: false });
    const future = await dayAppointment(biz, addDays(TODAY, 3));
    const startAt = new Date(noonOf(biz, past).getTime());
    const timed = await prisma.appointment.create({
      data: { businessId: biz.businessId, clientId: biz.clientId, startAt, endAt: new Date(startAt.getTime() + 30 * 60_000) },
    });

    const result = await autoCompleteDueAppointments(biz.businessId, clockAt(biz, noonOf(biz, TODAY)));
    expect(result.completed).toBe(0);
    expect(await Promise.all([ineligible, cancelled, noShow, future, timed.id].map(statusOf))).toEqual([
      "AGENDADO", "CANCELADO", "FALTOU", "AGENDADO", "AGENDADO",
    ]);
    expect(await prisma.sale.count({ where: { businessId: biz.businessId } })).toBe(0);
  });

  it("desfeito NÃO é reconcluído pela carga seguinte", async () => {
    const biz = await newBusiness(tz);
    const id = await dayAppointment(biz, addDays(TODAY, -1));
    const clock = clockAt(biz, noonOf(biz, TODAY));
    await autoCompleteDueAppointments(biz.businessId, clock);
    expect((await undoAppointmentCompletion(biz.businessId, id, "AGENDADO")).ok).toBe(true);

    const again = await autoCompleteDueAppointments(biz.businessId, clock);
    expect(again.completed).toBe(0);
    const a = await prisma.appointment.findUniqueOrThrow({ where: { id } });
    expect([a.status, a.autoCompleteEligible, a.saleId]).toEqual(["AGENDADO", false, null]);
    expect((await salesOf(id)).map((s) => s.status)).toEqual(["CANCELLED"]);
  });

  it("mais de 50 pendentes são concluídos na mesma carga (vários lotes)", async () => {
    const biz = await newBusiness(tz);
    const ids: string[] = [];
    for (let i = 0; i < 55; i++) ids.push(await dayAppointment(biz, addDays(TODAY, -1 - (i % 5))));

    // Limite de tempo folgado: aqui o assunto e o lote de 50 (o limite de
    // tempo tem caso proprio abaixo).
    const result = await autoCompleteDueAppointments(biz.businessId, clockAt(biz, noonOf(biz, TODAY)), { timeBudgetMs: 60_000 });
    expect(result).toEqual({ completed: 55, failed: 0, stoppedByTimeLimit: false });
    expect(await prisma.appointment.count({ where: { id: { in: ids }, status: "CONCLUIDO" } })).toBe(55);
    expect(await prisma.sale.count({ where: { businessId: biz.businessId } })).toBe(55);
  }, 60_000);

  it("limite de tempo esgotado: para sem concluir e deixa o resto para a próxima carga", async () => {
    const biz = await newBusiness(tz);
    const id = await dayAppointment(biz, addDays(TODAY, -1));
    const clock = clockAt(biz, noonOf(biz, TODAY));

    expect(await autoCompleteDueAppointments(biz.businessId, clock, { timeBudgetMs: 0 })).toEqual({ completed: 0, failed: 0, stoppedByTimeLimit: true });
    expect(await statusOf(id)).toBe("AGENDADO");
    expect((await autoCompleteDueAppointments(biz.businessId, clock)).completed).toBe(1);
  });

  it("serviço sem valor é pulado (log) sem afetar os demais", async () => {
    const biz = await newBusiness(tz);
    const broken = await dayAppointment(biz, addDays(TODAY, -3), { unitPrice: null }); // primeiro na ordem
    const ok = await dayAppointment(biz, addDays(TODAY, -1));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await autoCompleteDueAppointments(biz.businessId, clockAt(biz, noonOf(biz, TODAY)));
    expect(result).toEqual({ completed: 1, failed: 1, stoppedByTimeLimit: false });
    expect([await statusOf(broken), await statusOf(ok)]).toEqual(["AGENDADO", "CONCLUIDO"]);
    expect(log.mock.calls.some((args) => String(args[0]).includes(broken))).toBe(true);
    log.mockRestore();
  });

  it("duas cargas simultâneas: uma venda por atendimento", async () => {
    const biz = await newBusiness(tz);
    const ids = await Promise.all([1, 2, 3].map((n) => dayAppointment(biz, addDays(TODAY, -n))));
    const clock = clockAt(biz, noonOf(biz, TODAY));

    const [a, b] = await Promise.all([autoCompleteDueAppointments(biz.businessId, clock), autoCompleteDueAppointments(biz.businessId, clock)]);
    expect(a.completed + b.completed).toBe(3);
    expect(a.failed + b.failed).toBe(0);
    for (const id of ids) {
      expect(await statusOf(id)).toBe("CONCLUIDO");
      expect(await salesOf(id)).toHaveLength(1);
    }
    expect(await prisma.financialEntry.count({ where: { businessId: biz.businessId } })).toBe(3);
  });

  it("venda e receita ficam no DIA DO ATENDIMENTO (3 dias atrás), não no dia da carga", async () => {
    const biz = await newBusiness(tz);
    const day = addDays(TODAY, -3);
    const id = await dayAppointment(biz, day);
    const now = noonOf(biz, TODAY);

    await autoCompleteDueAppointments(biz.businessId, clockAt(biz, now));
    const [sale] = await salesOf(id);
    expect(dbDateToKey(sale.saleOn)).toBe(day);
    expect(sale.bills.map((b) => [b.status, dbDateToKey(b.paidOn!), dbDateToKey(b.financialEntry!.occurredOn), b.financialEntry!.amount.toString()])).toEqual([
      ["PAID", day, day, "70"],
    ]);
    const a = await prisma.appointment.findUniqueOrThrow({ where: { id } });
    expect([a.saleId, a.completedAt?.getTime()]).toEqual([sale.id, now.getTime()]);
  });
});
