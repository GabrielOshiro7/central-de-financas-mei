import { describe, it, expect } from "vitest";
import { resolveSaleDateFromAppointment } from "@/lib/agenda/calculations";

describe("resolveSaleDateFromAppointment - equivalência byte-a-byte com venda manual", () => {
  it("produz o mesmo instante que uma venda manual criada no mesmo dia calendário de Tóquio", () => {
    const startAt = new Date("2026-01-31T14:30:00Z"); // 23:30 de 31/jan em Toquio
    const agendaSaleDate = resolveSaleDateFromAppointment(startAt);

    // O que SaleForm manda (input type="date") + o que api/vendas/route.ts
    // faz com isso (`new Date(data.saleDate)`) - reproduzido aqui, nao
    // importado, porque e exatamente o caminho que precisa ser reproduzido
    // byte a byte, nao reaproveitado por import.
    const manualSaleDateInput = "2026-01-31";
    const manualSaleDate = new Date(manualSaleDateInput);

    expect(agendaSaleDate.getTime()).toBe(manualSaleDate.getTime());
    expect(agendaSaleDate.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  it("virada de meia-noite de Toquio: instante as 15:30Z (00:30 de 1/fev em Toquio) gera o mesmo saleDate que uma venda manual do dia 1/fev, NUNCA do dia 31/jan", () => {
    const startAt = new Date("2026-01-31T15:30:00Z");
    const agendaSaleDate = resolveSaleDateFromAppointment(startAt);

    const manualSaleDateForFeb1 = new Date("2026-02-01");
    expect(agendaSaleDate.getTime()).toBe(manualSaleDateForFeb1.getTime());

    const manualSaleDateForJan31 = new Date("2026-01-31");
    expect(agendaSaleDate.getTime()).not.toBe(manualSaleDateForJan31.getTime());
  });

  it("NUNCA usa Date.UTC/aritmética direta do instante - reconstrução alternativa (Tóquio meia-noite real) produziria um resultado DIFERENTE", () => {
    const startAt = new Date("2026-01-31T14:30:00Z");
    const agendaSaleDate = resolveSaleDateFromAppointment(startAt);

    // Meia-noite REAL de Toquio do dia 31/jan (o instante que Date.UTC(...)
    // com offset fixo produziria) e 2026-01-30T15:00:00.000Z - DIFERENTE do
    // que resolveSaleDateFromAppointment devolve (2026-01-31T00:00:00.000Z,
    // meia-noite UTC da string). Esse teste existe pra pegar exatamente o
    // erro que a diretriz da Etapa 8 pediu pra evitar.
    const tokyoRealMidnight = new Date(Date.UTC(2026, 0, 31, 0, 0, 0) - 9 * 60 * 60 * 1000);
    expect(agendaSaleDate.getTime()).not.toBe(tokyoRealMidnight.getTime());
    expect(agendaSaleDate.toISOString()).toBe("2026-01-31T00:00:00.000Z");
    expect(tokyoRealMidnight.toISOString()).toBe("2026-01-30T15:00:00.000Z");
  });
});
