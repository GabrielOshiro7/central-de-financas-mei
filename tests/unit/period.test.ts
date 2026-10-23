import { describe, it, expect } from "vitest";
import {
  resolvePeriodRange,
  getPreviousPeriodRange,
  resolveComparisonRange,
  parseCustomRangeParams,
} from "@/lib/finance/period";
import { PROCESS_TZ, processClock } from "../helpers/processClock";

describe("resolvePeriodRange", () => {
  const now = new Date(2026, 2, 15); // 15 de março de 2026

  it("THIS_MONTH cobre só o mês atual", () => {
    const { start, end, months } = resolvePeriodRange("THIS_MONTH", processClock(now));
    expect(start).toEqual(new Date(2026, 2, 1));
    expect(end).toEqual(new Date(2026, 3, 1));
    expect(months).toEqual([{ year: 2026, month: 2 }]);
  });

  it("LAST_MONTH cobre o mês anterior", () => {
    const { months } = resolvePeriodRange("LAST_MONTH", processClock(now));
    expect(months).toEqual([{ year: 2026, month: 1 }]);
  });

  it("LAST_3_MONTHS inclui o mês atual e os 2 anteriores", () => {
    const { months } = resolvePeriodRange("LAST_3_MONTHS", processClock(now));
    expect(months).toEqual([
      { year: 2026, month: 0 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ]);
  });

  it("LAST_6_MONTHS inclui 6 meses terminando no atual", () => {
    const { months } = resolvePeriodRange("LAST_6_MONTHS", processClock(now));
    expect(months.length).toBe(6);
    expect(months[months.length - 1]).toEqual({ year: 2026, month: 2 });
    expect(months[0]).toEqual({ year: 2025, month: 9 });
  });

  it("THIS_YEAR vai de janeiro até o mês atual", () => {
    const { months } = resolvePeriodRange("THIS_YEAR", processClock(now));
    expect(months.length).toBe(3);
    expect(months[0]).toEqual({ year: 2026, month: 0 });
    expect(months[2]).toEqual({ year: 2026, month: 2 });
  });

  it("CUSTOM cobre exatamente o intervalo escolhido (fim inclusivo)", () => {
    const { start, end, months } = resolvePeriodRange("CUSTOM", processClock(now), {
      start: "2026-02-20",
      end: "2026-03-05",
    });
    expect(start).toEqual(new Date(2026, 1, 20));
    expect(end).toEqual(new Date(2026, 2, 6)); // exclusivo: dia seguinte ao fim escolhido
    expect(months).toEqual([
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ]);
  });

  it("CUSTOM sem customRange lança erro (uso indevido da API)", () => {
    expect(() => resolvePeriodRange("CUSTOM", processClock(now))).toThrow();
  });
});

// Novos PeriodKey da Etapa 4 (por dia e ano anterior) + o campo `alignment`
// que substitui a heuristica antiga (start.getDate() === 1) para decidir se
// getPreviousPeriodRange/resolveComparisonRange tratam o range como "um
// numero de meses civis" ou "uma duracao em dias".
describe("resolvePeriodRange - novos períodos por dia/ano (Etapa 4)", () => {
  const now = new Date(2026, 8, 15); // 15 de setembro de 2026

  it("TODAY cobre só o dia de hoje", () => {
    const { start, end, months, alignment } = resolvePeriodRange("TODAY", processClock(now));
    expect(start).toEqual(new Date(2026, 8, 15));
    expect(end).toEqual(new Date(2026, 8, 16));
    expect(months).toEqual([{ year: 2026, month: 8 }]);
    expect(alignment).toBe("day");
  });

  it("LAST_7_DAYS cobre os 7 dias terminando hoje (inclusive)", () => {
    const { start, end, alignment } = resolvePeriodRange("LAST_7_DAYS", processClock(now));
    expect(start).toEqual(new Date(2026, 8, 9));
    expect(end).toEqual(new Date(2026, 8, 16));
    expect(alignment).toBe("day");
  });

  it("LAST_30_DAYS cobre os 30 dias terminando hoje, cruzando o mês anterior", () => {
    const { start, end, months, alignment } = resolvePeriodRange("LAST_30_DAYS", processClock(now));
    expect(start).toEqual(new Date(2026, 7, 17));
    expect(end).toEqual(new Date(2026, 8, 16));
    expect(months).toEqual([
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ]);
    expect(alignment).toBe("day");
  });

  it("LAST_90_DAYS cobre os 90 dias terminando hoje", () => {
    const { start, end, alignment } = resolvePeriodRange("LAST_90_DAYS", processClock(now));
    expect(start).toEqual(new Date(2026, 5, 18));
    expect(end).toEqual(new Date(2026, 8, 16));
    expect(alignment).toBe("day");
  });

  it("LAST_YEAR cobre o ano civil anterior inteiro", () => {
    const { start, end, months, alignment } = resolvePeriodRange("LAST_YEAR", processClock(now));
    expect(start).toEqual(new Date(2025, 0, 1));
    expect(end).toEqual(new Date(2026, 0, 1));
    expect(months.length).toBe(12);
    expect(months[0]).toEqual({ year: 2025, month: 0 });
    expect(months[11]).toEqual({ year: 2025, month: 11 });
    expect(alignment).toBe("month");
  });

  it("CUSTOM de 1º a 31/mar (visualmente um mês inteiro) continua alignment 'day'", () => {
    // Terceiro caso de colisao que motivou o campo `alignment`: um CUSTOM que
    // por coincidencia cobre um mes inteiro nao deve ser tratado como
    // "alinhado a mes" - e um range arbitrario do usuario, nao THIS_MONTH.
    const { start, end, months, alignment } = resolvePeriodRange("CUSTOM", processClock(now), {
      start: "2026-03-01",
      end: "2026-03-31",
    });
    expect(start).toEqual(new Date(2026, 2, 1));
    expect(end).toEqual(new Date(2026, 3, 1));
    expect(months).toEqual([{ year: 2026, month: 2 }]);
    expect(alignment).toBe("day");
  });
});

describe("getPreviousPeriodRange", () => {
  it("THIS_MONTH -> período anterior é o mês anterior", () => {
    const now = new Date(2026, 2, 15);
    const current = resolvePeriodRange("THIS_MONTH", processClock(now));
    const previous = getPreviousPeriodRange(current);
    expect(previous).toEqual({ start: new Date(2026, 1, 1), end: new Date(2026, 2, 1) });
  });

  it("um período custom de 15 dias -> anterior são os 15 dias imediatamente antes", () => {
    // alignment "day" (nao "month") e o que manda esse range pro ramo
    // generico por duracao em getPreviousPeriodRange - a decisao e por esse
    // campo explicito, nao mais por `start.getDate() === 1` (heuristica antiga
    // que dava falso positivo em ranges por dia que coincidem com o dia 1).
    const current = {
      start: new Date(2026, 2, 16),
      end: new Date(2026, 2, 31),
      months: [],
      alignment: "day" as const,
      timeZone: PROCESS_TZ,
    };
    const previous = getPreviousPeriodRange(current);
    expect(previous).toEqual({ start: new Date(2026, 2, 1), end: new Date(2026, 2, 16) });
  });
});

// Regressao especifica do bug de colisao encontrado na revisao: inferir
// "alinhado a mes" a partir de `start.getDate() === 1` da falso positivo
// quando um periodo POR DIA comeca, por coincidencia, no dia 1 de um mes.
describe("alignment - períodos por dia que coincidem com o dia 1 do mês (regressão)", () => {
  it("TODAY no dia 1º de março -> período anterior é 28/fev (ontem), não fevereiro inteiro", () => {
    const now = new Date(2026, 2, 1); // 1/mar/2026 (2026 não é bissexto)
    const current = resolvePeriodRange("TODAY", processClock(now));
    expect(current.alignment).toBe("day");
    const previous = getPreviousPeriodRange(current);
    expect(previous).toEqual({ start: new Date(2026, 1, 28), end: new Date(2026, 2, 1) });
  });

  it("LAST_7_DAYS quando hoje é dia 7 (start cai no dia 1) -> período anterior são os 7 dias anteriores, não o mês inteiro anterior", () => {
    const now = new Date(2026, 2, 7); // 7/mar/2026 -> start = 1/mar/2026
    const current = resolvePeriodRange("LAST_7_DAYS", processClock(now));
    expect(current.start).toEqual(new Date(2026, 2, 1));
    expect(current.alignment).toBe("day");
    const previous = getPreviousPeriodRange(current);
    expect(previous).toEqual({ start: new Date(2026, 1, 22), end: new Date(2026, 2, 1) });
  });
});

// Limites de meia-noite (secao "fuso horario" do ADENDO da Etapa 4) - ver
// comentario de decisao no topo de period.ts.
describe("limites de meia-noite", () => {
  it("TODAY inclui até 23:59:59.999 do dia e exclui a meia-noite seguinte", () => {
    const now = new Date(2026, 8, 1, 23, 59, 59, 999); // 1/set/2026 23:59:59.999
    const { start, end } = resolvePeriodRange("TODAY", processClock(now));
    expect(start).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 8, 2, 0, 0, 0, 0));

    const almostMidnight = new Date(2026, 8, 1, 23, 59, 59, 999);
    const startOfNextDay = new Date(2026, 8, 2, 0, 0, 0, 0);
    expect(almostMidnight.getTime() >= start.getTime() && almostMidnight.getTime() < end.getTime()).toBe(true);
    expect(startOfNextDay.getTime() < end.getTime()).toBe(false); // já é o dia seguinte, fora do range
  });
});

describe("resolveComparisonRange", () => {
  it("PREVIOUS_PERIOD delega para getPreviousPeriodRange", () => {
    const now = new Date(2026, 2, 15);
    const current = resolvePeriodRange("THIS_MONTH", processClock(now));
    const comparison = resolveComparisonRange("PREVIOUS_PERIOD", current);
    expect(comparison).toEqual(getPreviousPeriodRange(current));
    expect(comparison).toEqual({ start: new Date(2026, 1, 1), end: new Date(2026, 2, 1) });
  });

  it("NONE não gera range de comparação", () => {
    const current = resolvePeriodRange("THIS_MONTH", processClock(new Date(2026, 2, 15)));
    expect(resolveComparisonRange("NONE", current)).toBeNull();
  });

  it("SAME_PERIOD_LAST_YEAR (mês alinhado) compara com o mesmo mês civil do ano anterior", () => {
    const current = resolvePeriodRange("THIS_MONTH", processClock(new Date(2026, 2, 15))); // março/2026
    const comparison = resolveComparisonRange("SAME_PERIOD_LAST_YEAR", current);
    expect(comparison).toEqual({ start: new Date(2025, 2, 1), end: new Date(2025, 3, 1) }); // março/2025
  });

  it("SAME_PERIOD_LAST_YEAR com período por dia contendo 29/fev normaliza para 1/mar no ano anterior (comportamento documentado, não bug)", () => {
    // 2028 é bissexto (29/fev existe); 2027 não é (fev tem só 28 dias). A
    // normalizacao nativa de Date faz `new Date(2027, 1, 29)` rolar para
    // 1/mar/2027 - decisao registrada no comentario de getSameRangeLastYear
    // em period.ts: nao ha uma data "correta" alternativa para esse caso, e
    // periodos ALINHADOS A MES (o outro ramo) nunca passam por essa
    // normalizacao, ja que comparam meses civis inteiros, nao dias soltos.
    const now = new Date(2028, 1, 29); // 29/fev/2028
    const current = resolvePeriodRange("TODAY", processClock(now));
    expect(current.alignment).toBe("day");

    const comparison = resolveComparisonRange("SAME_PERIOD_LAST_YEAR", current);
    expect(comparison).toEqual({ start: new Date(2027, 2, 1), end: new Date(2027, 2, 1) }); // range de duração zero
  });
});

describe("parseCustomRangeParams", () => {
  it("aceita duas datas válidas em ordem", () => {
    const range = parseCustomRangeParams("2026-01-01", "2026-01-31");
    // Desde a F3a o período personalizado é de datas de calendário (sem fuso).
    expect(range).toEqual({ start: "2026-01-01", end: "2026-01-31" });
  });

  it("retorna undefined quando falta uma data", () => {
    expect(parseCustomRangeParams("2026-01-01", null)).toBeUndefined();
    expect(parseCustomRangeParams(null, "2026-01-31")).toBeUndefined();
  });

  it("retorna undefined quando o início vem depois do fim", () => {
    expect(parseCustomRangeParams("2026-02-01", "2026-01-01")).toBeUndefined();
  });
});
