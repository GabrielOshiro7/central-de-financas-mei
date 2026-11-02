import { describe, it, expect } from "vitest";
import { resolveSaleDayFromAppointment } from "@/lib/agenda/calculations";
import { dayFromInput } from "@/lib/finance/entryDay";

// Fuso da empresa de teste: Asia/Tokyo (default da F2). Antes da F3c a Agenda
// usava o fuso fixo AGENDA_TIMEZONE = "Asia/Tokyo" - mesmo valor.
const BUSINESS_TZ = "Asia/Tokyo";

// Etapa F6c: a venda gerada pela conclusao passou a gravar o DIA (Sale.saleOn,
// DateKey) - o mesmo dia que uma venda manual "YYYY-MM-DD" grava. Antes
// (Etapa 8) a equivalencia era entre INSTANTES: a meia-noite UTC da string
// (new Date("YYYY-MM-DD")), a representacao antiga que a F6c substituiu por
// 00:00 do dia no fuso da empresa. As asserções abaixo trocaram de instante
// para dia; o dia esperado e o mesmo de antes.
describe("resolveSaleDayFromAppointment - mesmo dia de uma venda manual", () => {
  it("é o mesmo dia que uma venda manual criada no mesmo dia calendário de Tóquio", () => {
    const startAt = new Date("2026-01-31T14:30:00Z"); // 23:30 de 31/jan em Toquio
    // O que SaleForm manda (input type="date") e o que api/vendas/route.ts
    // faz com isso (dayFromInput).
    expect(resolveSaleDayFromAppointment(startAt, BUSINESS_TZ)).toBe(dayFromInput("2026-01-31", BUSINESS_TZ));
    expect(resolveSaleDayFromAppointment(startAt, BUSINESS_TZ)).toBe("2026-01-31");
  });

  it("virada de meia-noite de Toquio: 15:30Z (00:30 de 1/fev em Toquio) é o dia 1/fev, NUNCA 31/jan", () => {
    const startAt = new Date("2026-01-31T15:30:00Z");
    expect(resolveSaleDayFromAppointment(startAt, BUSINESS_TZ)).toBe("2026-02-01");
    expect(resolveSaleDayFromAppointment(startAt, BUSINESS_TZ)).not.toBe("2026-01-31");
  });

  it("é o dia no fuso da EMPRESA, nunca o dia UTC do instante", () => {
    const startAt = new Date("2026-01-31T15:30:00Z"); // ainda 31/jan em UTC
    expect(startAt.toISOString().slice(0, 10)).toBe("2026-01-31");
    expect(resolveSaleDayFromAppointment(startAt, BUSINESS_TZ)).toBe("2026-02-01");
    expect(resolveSaleDayFromAppointment(startAt, "UTC")).toBe("2026-01-31");
  });
});
