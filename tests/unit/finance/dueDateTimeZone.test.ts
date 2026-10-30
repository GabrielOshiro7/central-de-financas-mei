import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { deriveBillStatus } from "@/lib/finance/bills/status";
import { generateBillOccurrences } from "@/lib/finance/bills/occurrences";
import { deriveSalePaymentStatus, splitEqualInstallments } from "@/lib/sales/calculations";
import { dateKeyToDbDate, startOfDayInstant } from "@/lib/time/zoned";

// Etapa F3b: vencimento ("vencido" / "vence hoje") no FUSO DA EMPRESA,
// independente do fuso do processo. Instantes em UTC explicito; o resultado
// e o mesmo com o processo em UTC, Asia/Tokyo ou America/New_York.
const clock = (nowIso: string, timeZone: string) => ({ now: new Date(nowIso), timeZone });
// Vencimento/inicio = o dia gravado nas colunas @db.Date (dueOn/startOn,
// Etapa F6b-2).
const day = dateKeyToDbDate;

describe("deriveBillStatus no fuso da empresa", () => {
  // 25/10 15:30Z = 00:30 de 26/10 em Tóquio (o dia UTC ainda é 25/10).
  const TOKYO_0030 = clock("2026-10-25T15:30:00Z", "Asia/Tokyo");

  it("empresa Tóquio às 00:30 JST: conta de hoje (26/10) vence hoje (PENDING), a de ontem está vencida", () => {
    expect(deriveBillStatus({ status: "PENDING", dueOn: day("2026-10-26") }, TOKYO_0030)).toBe("PENDING");
    expect(deriveBillStatus({ status: "PENDING", dueOn: day("2026-10-25") }, TOKYO_0030)).toBe("OVERDUE");
    expect(deriveBillStatus({ status: "PENDING", dueOn: day("2026-10-27") }, TOKYO_0030)).toBe("PENDING");
  });

  it("empresa UTC no mesmo instante: ainda é 25/10, então a conta de 25/10 vence hoje", () => {
    const utc = clock("2026-10-25T15:30:00Z", "UTC");
    expect(deriveBillStatus({ status: "PENDING", dueOn: day("2026-10-25") }, utc)).toBe("PENDING");
    expect(deriveBillStatus({ status: "PENDING", dueOn: day("2026-10-24") }, utc)).toBe("OVERDUE");
  });

  it("empresa São Paulo às 23:00 de 25/10 (já 26/10 em UTC/Tóquio): a conta de 25/10 ainda vence hoje", () => {
    const sp = clock("2026-10-26T02:00:00Z", "America/Sao_Paulo");
    expect(deriveBillStatus({ status: "PENDING", dueOn: day("2026-10-25") }, sp)).toBe("PENDING");
    expect(deriveBillStatus({ status: "PENDING", dueOn: day("2026-10-24") }, sp)).toBe("OVERDUE");
  });

  it("PAID e CANCELLED nunca viram OVERDUE", () => {
    expect(deriveBillStatus({ status: "PAID", dueOn: day("2020-01-01") }, TOKYO_0030)).toBe("PAID");
    expect(deriveBillStatus({ status: "CANCELLED", dueOn: day("2020-01-01") }, TOKYO_0030)).toBe("CANCELLED");
  });
});

describe("deriveSalePaymentStatus no fuso da empresa", () => {
  it("parcela de hoje (Tóquio, 00:30 JST) não atrasa a venda; a de ontem atrasa", () => {
    const tokyo = clock("2026-10-25T15:30:00Z", "Asia/Tokyo");
    expect(deriveSalePaymentStatus([{ status: "PENDING", dueOn: day("2026-10-26") }], tokyo)).toBe("NAO_PAGA");
    expect(deriveSalePaymentStatus([{ status: "PENDING", dueOn: day("2026-10-25") }], tokyo)).toBe("ATRASADA");
    // Mesmo instante, empresa UTC: 25/10 ainda é hoje.
    expect(deriveSalePaymentStatus([{ status: "PENDING", dueOn: day("2026-10-25") }], clock("2026-10-25T15:30:00Z", "UTC"))).toBe(
      "NAO_PAGA"
    );
  });
});

describe("splitEqualInstallments avança por dias de calendário no fuso dado", () => {
  it("Tóquio e New York (atravessando o horário de verão): 00:00 de cada vencimento", () => {
    const tokyo = splitEqualInstallments(new Prisma.Decimal(300), 3, startOfDayInstant("2026-01-10", "Asia/Tokyo"), 30, "BRL", "Asia/Tokyo");
    expect(tokyo.map((p) => p.dueDate.toISOString())).toEqual([
      "2026-01-09T15:00:00.000Z",
      "2026-02-08T15:00:00.000Z",
      "2026-03-10T15:00:00.000Z",
    ]);
    const ny = splitEqualInstallments(new Prisma.Decimal(300), 3, startOfDayInstant("2026-02-20", "America/New_York"), 30, "BRL", "America/New_York");
    expect(ny.map((p) => p.dueDate.toISOString())).toEqual([
      "2026-02-20T05:00:00.000Z", // EST
      "2026-03-22T04:00:00.000Z", // EDT (depois de 08/03)
      "2026-04-21T04:00:00.000Z",
    ]);
  });
});

describe("generateBillOccurrences: limite comparado por dia no fuso da empresa", () => {
  it("empresa Tóquio: o dia-limite (Tóquio) inclui a ocorrência daquele dia; um dia antes, não", () => {
    // Molde mensal dia 20 começando em 20/10 (startOn, o dia gravado).
    // As DATAS das ocorrências ainda vêm do motor local de
    // recurring/occurrences.ts (F5); para empresa em Tóquio elas caem no dia
    // certo com o processo em UTC, Tóquio ou New York - por isso o caso aqui.
    const entry = {
      frequency: "MONTHLY" as const,
      dayOfWeek: null,
      dayOfMonth: 20,
      yearMonth: null,
      startOn: day("2026-10-20"),
      endOn: null,
    };
    const tz = "Asia/Tokyo";
    const upto20 = generateBillOccurrences(entry, new Date("2026-11-20T03:00:00Z"), tz); // 20/11 12:00 JST
    const upto19 = generateBillOccurrences(entry, new Date("2026-11-19T14:59:59Z"), tz); // 19/11 23:59 JST
    expect(upto19).toHaveLength(1); // só 20/10
    expect(upto20).toHaveLength(2); // 20/10 e 20/11
  });
});
