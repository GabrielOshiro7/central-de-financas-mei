import { describe, it, expect } from "vitest";
import { formatDateRange } from "@/lib/finance/format";
import { addDays, dayRange, formatInstant, formatZonedDate, monthRange, toDateKey, todayKey } from "@/lib/time/zoned";

// Etapa F4: exibicao de datas no fuso da EMPRESA. Todos os casos usam
// instantes absolutos ("...Z") - o resultado nao pode depender do TZ do
// processo (a matriz UTC/Tokyo/New_York roda este arquivo sem mudar nada).
const at = (iso: string) => new Date(iso);

describe("formatZonedDate (data de um timestamp gravado, no fuso dado)", () => {
  it("entrada manual gravada a meia-noite UTC (new Date('YYYY-MM-DD') das rotas atuais)", () => {
    const stored = at("2026-10-20T00:00:00.000Z"); // 09:00 JST / 21:00 de 19/10 em Sao Paulo
    expect(formatZonedDate(stored, "Asia/Tokyo")).toBe("20/10/2026");
    expect(formatZonedDate(stored, "UTC")).toBe("20/10/2026");
    expect(formatZonedDate(stored, "America/Sao_Paulo")).toBe("19/10/2026");
  });

  it("recorrente materializado a meia-noite de Toquio (15:00 UTC do dia anterior)", () => {
    const stored = at("2026-10-19T15:00:00.000Z");
    expect(formatZonedDate(stored, "Asia/Tokyo")).toBe("20/10/2026");
    expect(formatZonedDate(stored, "UTC")).toBe("19/10/2026");
    expect(formatZonedDate(stored, "America/Sao_Paulo")).toBe("19/10/2026");
  });

  it("madrugada de Toquio (00:00-09:00 JST): o dia e o de Toquio, nao o de UTC", () => {
    const early = at("2026-10-26T20:30:00.000Z"); // 27/10 05:30 JST
    expect(formatZonedDate(early, "Asia/Tokyo")).toBe("27/10/2026");
    expect(formatZonedDate(early, "UTC")).toBe("26/10/2026");
    expect(formatZonedDate(early, "America/Sao_Paulo")).toBe("26/10/2026");
    // Limites exatos da janela: 00:00 JST e 08:59:59 JST continuam no dia de Toquio.
    expect(formatZonedDate(at("2026-10-26T15:00:00.000Z"), "Asia/Tokyo")).toBe("27/10/2026");
    expect(formatZonedDate(at("2026-10-26T23:59:59.999Z"), "Asia/Tokyo")).toBe("27/10/2026");
    expect(formatZonedDate(at("2026-10-26T14:59:59.999Z"), "Asia/Tokyo")).toBe("26/10/2026");
  });

  it("estilo longo", () => {
    expect(formatZonedDate(at("2026-10-26T20:30:00.000Z"), "Asia/Tokyo", "long")).toBe("27 de outubro de 2026");
  });

  it("e o mesmo dia que toDateKey usa para o valor inicial de <input type=date>", () => {
    const early = at("2026-10-26T20:30:00.000Z");
    expect(toDateKey(early, "Asia/Tokyo")).toBe("2026-10-27");
    expect(toDateKey(early, "America/Sao_Paulo")).toBe("2026-10-26");
  });
});

describe("formatDateRange (cabecalho do dashboard)", () => {
  it("mes inteiro no proprio fuso: 01 a 31", () => {
    for (const tz of ["Asia/Tokyo", "America/Sao_Paulo", "UTC"]) {
      const { start, end } = monthRange(2026, 10, tz);
      expect(formatDateRange(start, end, tz), tz).toBe("01/10/2026 — 31/10/2026");
    }
  });

  it("o mesmo intervalo (mes de Toquio) lido em outro fuso mostra outros dias - por isso o fuso e parametro", () => {
    const { start, end } = monthRange(2026, 10, "Asia/Tokyo");
    expect(formatDateRange(start, end, "Asia/Tokyo")).toBe("01/10/2026 — 31/10/2026");
    expect(formatDateRange(start, end, "UTC")).toBe("30/09/2026 — 31/10/2026");
    expect(formatDateRange(start, end, "America/Sao_Paulo")).toBe("30/09/2026 — 31/10/2026");
  });

  it("'Hoje' as 05:30 JST (20:30 UTC do dia anterior) mostra o dia de Toquio", () => {
    const clock = { timeZone: "Asia/Tokyo", now: at("2026-10-26T20:30:00.000Z") };
    const { start, end } = dayRange(todayKey(clock), clock.timeZone);
    expect(formatDateRange(start, end, "Asia/Tokyo")).toBe("27/10/2026 — 27/10/2026");
  });

  it("'Ultimos 7 dias' na madrugada de Toquio", () => {
    const clock = { timeZone: "Asia/Tokyo", now: at("2026-10-26T20:30:00.000Z") };
    const today = todayKey(clock);
    const start = dayRange(addDays(today, -6), clock.timeZone).start;
    const end = dayRange(today, clock.timeZone).end;
    expect(formatDateRange(start, end, "Asia/Tokyo")).toBe("21/10/2026 — 27/10/2026");
  });

  it("intervalo de um dia em Sao Paulo atravessando o fim do horario de verao nao muda de dia", () => {
    // 2026 sem DST no Brasil; New York sai do horario de verao em 01/11/2026 (dia de 25 h).
    const { start, end } = dayRange("2026-11-01", "America/New_York");
    expect(formatDateRange(start, end, "America/New_York")).toBe("01/11/2026 — 01/11/2026");
  });
});

describe("'hoje as HH:mm' do dashboard (formatInstant com o fuso da empresa)", () => {
  const now = at("2026-10-26T20:30:00.000Z");
  const opts = { hour: "2-digit", minute: "2-digit" } as const;
  it("Toquio, Sao Paulo e UTC", () => {
    expect(formatInstant(now, "Asia/Tokyo", opts)).toBe("05:30");
    expect(formatInstant(now, "America/Sao_Paulo", opts)).toBe("17:30");
    expect(formatInstant(now, "UTC", opts)).toBe("20:30");
  });
});
