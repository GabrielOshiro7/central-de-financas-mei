import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { materializeRecurringEntries } from "@/lib/finance/recurring/materialize";
import { materializeRecurringBills } from "@/lib/finance/bills/materialize";
import { clockFor, dateKeyToDbDate, dbDateToKey, startOfDayInstant, toDateKey, weekdayOf, dbDateOfInstant } from "@/lib/time/zoned";
import { materializeInProcessTz } from "../../helpers/materializeInProcessTz";

// Etapa F5: idempotencia dos recorrentes por DIA DE CALENDARIO no fuso da
// empresa. O incidente original: um servidor em UTC materializou moldes que
// o servidor em JST ja tinha gerado, e a chave antiga (molde, instante) nao
// reconheceu a "meia-noite" de outro fuso -> duplicatas. Aqui a mesma
// materializacao roda em PROCESSOS com TZ diferentes (filho via tsx) e no
// processo do proprio Vitest (que a matriz roda em UTC/Tokyo/New_York) - o
// resultado tem de ser sempre UMA linha por dia, com o mesmo instante.
const { Decimal } = Prisma;
const HOUR = 60 * 60 * 1000;

const createdUserIds: string[] = [];
let expenseCategoryId: string;

async function newBusiness(timezone: string) {
  const user = await prisma.user.create({
    data: { name: "Teste F5", email: `f5-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "x" },
  });
  createdUserIds.push(user.id);
  const business = await prisma.business.create({ data: { userId: user.id, name: `Empresa F5 ${timezone}`, currency: "BRL", timezone } });
  return { userId: user.id, businessId: business.id };
}

// startDate como o molde e gravado para a empresa: 00:00 do dia no fuso dela
// (independe de como a API grava hoje - isso e a F6).
function moldStart(key: string, timeZone: string) {
  return startOfDayInstant(key, timeZone);
}

async function entryRows(recurringEntryId: string) {
  const rows = await prisma.financialEntry.findMany({ where: { recurringEntryId }, orderBy: { occurredAt: "asc" } });
  return rows.map((r) => ({ day: dbDateToKey(r.occurrenceDate!), occurredAt: r.occurredAt.toISOString() }));
}

async function billRows(recurringBillId: string) {
  const rows = await prisma.bill.findMany({ where: { recurringBillId }, orderBy: { dueDate: "asc" } });
  return rows.map((r) => ({ day: dbDateToKey(r.occurrenceDate!), dueDate: r.dueDate.toISOString() }));
}

beforeAll(async () => {
  expenseCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "EXPENSE" } })).id;
});

afterAll(async () => {
  for (const userId of createdUserIds) {
    const business = await prisma.business.findUnique({ where: { userId } });
    if (business) {
      await prisma.financialEntry.deleteMany({ where: { businessId: business.id } });
      await prisma.bill.deleteMany({ where: { businessId: business.id } });
      await prisma.recurringEntry.deleteMany({ where: { businessId: business.id } });
      await prisma.recurringBill.deleteMany({ where: { businessId: business.id } });
      await prisma.business.delete({ where: { id: business.id } });
    }
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
});

describe("lançamentos recorrentes: uma linha por dia, qualquer que seja o fuso do processo", () => {
  it("mensal no dia 31 (clamp em fevereiro), materializado em UTC, no processo do Vitest e em New York -> 1 linha por dia", async () => {
    const tz = "Asia/Tokyo";
    const { userId, businessId } = await newBusiness(tz);
    const mold = await prisma.recurringEntry.create({
      data: {
        businessId, type: "EXPENSE", categoryId: expenseCategoryId, amount: new Decimal(100), description: "Mensal 31",
        frequency: "MONTHLY", dayOfMonth: 31, startDate: moldStart("2026-01-01", tz),
      },
    });
    // 05:30 JST de 15/04 = 20:30 UTC de 14/04: madrugada de Toquio, o pior caso.
    const now = new Date("2026-04-14T20:30:00.000Z");

    const first = materializeInProcessTz("UTC", "entries", businessId, userId, now);
    expect(first.processTimeZone).toBe("UTC");
    expect(first.created).toBe(3);

    const second = await materializeRecurringEntries(businessId, userId, now);
    expect(second.created).toBe(0);

    const third = materializeInProcessTz("America/New_York", "entries", businessId, userId, now);
    expect(third.processTimeZone).toBe("America/New_York");
    expect(third.created).toBe(0);

    expect(await entryRows(mold.id)).toEqual([
      { day: "2026-01-31", occurredAt: "2026-01-30T15:00:00.000Z" },
      { day: "2026-02-28", occurredAt: "2026-02-27T15:00:00.000Z" },
      { day: "2026-03-31", occurredAt: "2026-03-30T15:00:00.000Z" },
    ]);
  });

  it("cenário do incidente: linha antiga gravada por um host em UTC (meia-noite UTC) não é duplicada pela materialização nova", async () => {
    const tz = "Asia/Tokyo";
    const { userId, businessId } = await newBusiness(tz);
    const mold = await prisma.recurringEntry.create({
      data: {
        businessId, type: "EXPENSE", categoryId: expenseCategoryId, amount: new Decimal(50), description: "Legado UTC",
        frequency: "MONTHLY", dayOfMonth: 20, startDate: moldStart("2026-09-01", tz),
      },
    });
    // Como o host em UTC gravava em 20/09 (00:00 UTC = 09:00 JST, dia 20 em
    // Toquio); occurrenceDate e o que o backfill da migracao atribuiria.
    const legacyAt = new Date("2026-09-20T00:00:00.000Z");
    await prisma.financialEntry.create({
      data: {
        businessId, userId, type: "EXPENSE", categoryId: expenseCategoryId, amount: new Decimal(50), description: "Legado UTC",
        occurredAt: legacyAt, occurredOn: dbDateOfInstant(legacyAt, tz), occurrenceDate: dateKeyToDbDate(toDateKey(legacyAt, tz)), source: "RECURRING", recurringEntryId: mold.id,
      },
    });

    const result = await materializeRecurringEntries(businessId, userId, new Date("2026-10-25T03:00:00.000Z"));
    expect(result.created).toBe(1); // so 20/10; 20/09 ja existia
    expect(await entryRows(mold.id)).toEqual([
      { day: "2026-09-20", occurredAt: "2026-09-20T00:00:00.000Z" }, // a linha antiga, intocada
      { day: "2026-10-20", occurredAt: "2026-10-19T15:00:00.000Z" },
    ]);
  });

  it("concorrência: duas materializações simultâneas -> 1 linha por dia", async () => {
    const tz = "Asia/Tokyo";
    const { userId, businessId } = await newBusiness(tz);
    const mold = await prisma.recurringEntry.create({
      data: {
        businessId, type: "EXPENSE", categoryId: expenseCategoryId, amount: new Decimal(10), description: "Concorrente",
        frequency: "WEEKLY", dayOfWeek: 1, startDate: moldStart("2026-01-05", tz),
      },
    });
    const now = new Date("2026-02-02T03:00:00.000Z");
    const [a, b] = await Promise.all([
      materializeRecurringEntries(businessId, userId, now),
      materializeRecurringEntries(businessId, userId, now),
    ]);
    expect(a.created + b.created).toBe(5);
    expect((await entryRows(mold.id)).map((r) => r.day)).toEqual(["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26", "2026-02-02"]);
  });

  it("empresa em America/New_York: semanal atravessando o início e o fim do horário de verão grava cada segunda no dia certo (167 h e 169 h)", async () => {
    const tz = "America/New_York";
    const { userId, businessId } = await newBusiness(tz);
    const spring = await prisma.recurringEntry.create({
      data: {
        businessId, type: "EXPENSE", categoryId: expenseCategoryId, amount: new Decimal(10), description: "Semanal NY (março)",
        frequency: "WEEKLY", dayOfWeek: 1, startDate: moldStart("2026-03-02", tz), endDate: moldStart("2026-03-16", tz),
      },
    });
    const fall = await prisma.recurringEntry.create({
      data: {
        businessId, type: "EXPENSE", categoryId: expenseCategoryId, amount: new Decimal(10), description: "Semanal NY (novembro)",
        frequency: "WEEKLY", dayOfWeek: 1, startDate: moldStart("2026-10-26", tz), endDate: moldStart("2026-11-09", tz),
      },
    });
    await materializeRecurringEntries(businessId, userId, new Date("2026-11-20T12:00:00.000Z"));

    const springRows = await entryRows(spring.id);
    expect(springRows).toEqual([
      { day: "2026-03-02", occurredAt: "2026-03-02T05:00:00.000Z" }, // EST
      { day: "2026-03-09", occurredAt: "2026-03-09T04:00:00.000Z" }, // EDT (desde 08/03)
      { day: "2026-03-16", occurredAt: "2026-03-16T04:00:00.000Z" },
    ]);
    const fallRows = await entryRows(fall.id);
    expect(fallRows).toEqual([
      { day: "2026-10-26", occurredAt: "2026-10-26T04:00:00.000Z" }, // EDT
      { day: "2026-11-02", occurredAt: "2026-11-02T05:00:00.000Z" }, // EST (desde 01/11)
      { day: "2026-11-09", occurredAt: "2026-11-09T05:00:00.000Z" },
    ]);
    for (const row of [...springRows, ...fallRows]) {
      expect(weekdayOf(toDateKey(new Date(row.occurredAt), tz))).toBe(1);
      expect(toDateKey(new Date(row.occurredAt), tz)).toBe(row.day);
    }
    const gap = (rows: { occurredAt: string }[], i: number) => (Date.parse(rows[i].occurredAt) - Date.parse(rows[i - 1].occurredAt)) / HOUR;
    expect(gap(springRows, 1)).toBe(167); // semana do início do horário de verão
    expect(gap(springRows, 2)).toBe(168);
    expect(gap(fallRows, 1)).toBe(169); // semana do fim do horário de verão
    expect(gap(fallRows, 2)).toBe(168);
  });

  it("empresa em America/Sao_Paulo e em UTC: 00:00 do dia no fuso de cada uma", async () => {
    for (const [tz, expected] of [
      ["America/Sao_Paulo", ["2026-01-01T03:00:00.000Z", "2026-02-01T03:00:00.000Z", "2026-03-01T03:00:00.000Z"]],
      ["UTC", ["2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z"]],
    ] as const) {
      const { userId, businessId } = await newBusiness(tz);
      const mold = await prisma.recurringEntry.create({
        data: {
          businessId, type: "EXPENSE", categoryId: expenseCategoryId, amount: new Decimal(10), description: `Mensal ${tz}`,
          frequency: "MONTHLY", dayOfMonth: 1, startDate: moldStart("2026-01-01", tz),
        },
      });
      const now = startOfDayInstant("2026-03-15", tz);
      materializeInProcessTz("Asia/Tokyo", "entries", businessId, userId, now);
      await materializeRecurringEntries(businessId, userId, now);
      expect(await entryRows(mold.id), tz).toEqual([
        { day: "2026-01-01", occurredAt: expected[0] },
        { day: "2026-02-01", occurredAt: expected[1] },
        { day: "2026-03-01", occurredAt: expected[2] },
      ]);
    }
  });
});

describe("contas recorrentes: as mesmas propriedades", () => {
  it("mensal no dia 31 materializada em UTC, no processo do Vitest e em New York -> 1 conta por dia", async () => {
    const tz = "Asia/Tokyo";
    const { userId, businessId } = await newBusiness(tz);
    const mold = await prisma.recurringBill.create({
      data: {
        businessId, categoryId: expenseCategoryId, description: "Conta 31", amount: new Decimal(200),
        frequency: "MONTHLY", dayOfMonth: 31, startDate: moldStart("2026-01-01", tz), endDate: moldStart("2026-04-30", tz),
      },
    });
    const now = new Date("2026-01-14T20:30:00.000Z"); // 05:30 JST de 15/01; horizonte de 90 dias cobre até abril

    expect(materializeInProcessTz("UTC", "bills", businessId, userId, now)).toEqual({ processTimeZone: "UTC", created: 3 });
    expect((await materializeRecurringBills(businessId, clockFor({ timezone: tz }, now))).created).toBe(0);
    expect(materializeInProcessTz("America/New_York", "bills", businessId, userId, now)).toEqual({ processTimeZone: "America/New_York", created: 0 });

    expect(await billRows(mold.id)).toEqual([
      { day: "2026-01-31", dueDate: "2026-01-30T15:00:00.000Z" },
      { day: "2026-02-28", dueDate: "2026-02-27T15:00:00.000Z" },
      { day: "2026-03-31", dueDate: "2026-03-30T15:00:00.000Z" },
    ]);
  });

  it("cenário do incidente: conta antiga com vencimento à meia-noite UTC não é duplicada", async () => {
    const tz = "Asia/Tokyo";
    const { businessId } = await newBusiness(tz);
    const mold = await prisma.recurringBill.create({
      data: {
        businessId, categoryId: expenseCategoryId, description: "Conta legado", amount: new Decimal(30),
        frequency: "MONTHLY", dayOfMonth: 5, startDate: moldStart("2026-09-01", tz), endDate: moldStart("2026-10-31", tz),
      },
    });
    const legacyDue = new Date("2026-09-05T00:00:00.000Z");
    await prisma.bill.create({
      data: {
        businessId, categoryId: expenseCategoryId, description: "Conta legado", amount: new Decimal(30),
        dueDate: legacyDue, occurrenceDate: dateKeyToDbDate(toDateKey(legacyDue, tz)), recurringBillId: mold.id,
      },
    });
    const result = await materializeRecurringBills(businessId, clockFor({ timezone: tz }, new Date("2026-09-10T03:00:00.000Z")));
    expect(result.created).toBe(1);
    expect(await billRows(mold.id)).toEqual([
      { day: "2026-09-05", dueDate: "2026-09-05T00:00:00.000Z" },
      { day: "2026-10-05", dueDate: "2026-10-04T15:00:00.000Z" },
    ]);
  });

  it("empresa em America/New_York: semanal atravessando o horário de verão (167 h / 169 h), sempre segunda", async () => {
    const tz = "America/New_York";
    const { businessId } = await newBusiness(tz);
    const spring = await prisma.recurringBill.create({
      data: {
        businessId, categoryId: expenseCategoryId, description: "Conta semanal NY março", amount: new Decimal(5),
        frequency: "WEEKLY", dayOfWeek: 1, startDate: moldStart("2026-03-02", tz), endDate: moldStart("2026-03-09", tz),
      },
    });
    const fall = await prisma.recurringBill.create({
      data: {
        businessId, categoryId: expenseCategoryId, description: "Conta semanal NY novembro", amount: new Decimal(5),
        frequency: "WEEKLY", dayOfWeek: 1, startDate: moldStart("2026-10-26", tz), endDate: moldStart("2026-11-02", tz),
      },
    });
    await materializeRecurringBills(businessId, clockFor({ timezone: tz }, new Date("2026-09-01T12:00:00.000Z")));

    const springRows = await billRows(spring.id);
    const fallRows = await billRows(fall.id);
    expect(springRows).toEqual([
      { day: "2026-03-02", dueDate: "2026-03-02T05:00:00.000Z" },
      { day: "2026-03-09", dueDate: "2026-03-09T04:00:00.000Z" },
    ]);
    expect(fallRows).toEqual([
      { day: "2026-10-26", dueDate: "2026-10-26T04:00:00.000Z" },
      { day: "2026-11-02", dueDate: "2026-11-02T05:00:00.000Z" },
    ]);
    expect((Date.parse(springRows[1].dueDate) - Date.parse(springRows[0].dueDate)) / HOUR).toBe(167);
    expect((Date.parse(fallRows[1].dueDate) - Date.parse(fallRows[0].dueDate)) / HOUR).toBe(169);
    for (const row of [...springRows, ...fallRows]) expect(weekdayOf(toDateKey(new Date(row.dueDate), tz))).toBe(1);
  });

  it("empresa em America/Sao_Paulo e em UTC: vencimento às 00:00 do dia no fuso de cada uma", async () => {
    for (const [tz, expected] of [
      ["America/Sao_Paulo", ["2026-01-10T03:00:00.000Z", "2026-02-10T03:00:00.000Z"]],
      ["UTC", ["2026-01-10T00:00:00.000Z", "2026-02-10T00:00:00.000Z"]],
    ] as const) {
      const { userId, businessId } = await newBusiness(tz);
      const mold = await prisma.recurringBill.create({
        data: {
          businessId, categoryId: expenseCategoryId, description: `Conta ${tz}`, amount: new Decimal(10),
          frequency: "MONTHLY", dayOfMonth: 10, startDate: moldStart("2026-01-01", tz), endDate: moldStart("2026-02-28", tz),
        },
      });
      const now = startOfDayInstant("2026-01-02", tz);
      materializeInProcessTz("Asia/Tokyo", "bills", businessId, userId, now);
      await materializeRecurringBills(businessId, clockFor({ timezone: tz }, now));
      expect(await billRows(mold.id), tz).toEqual([
        { day: "2026-01-10", dueDate: expected[0] },
        { day: "2026-02-10", dueDate: expected[1] },
      ]);
    }
  });
});
