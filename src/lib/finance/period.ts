// TODAS as datas deste arquivo (e de quem o consome) sao resolvidas com o
// fuso horario LOCAL DO PROCESSO NODE, via getters nativos de Date
// (getFullYear/getMonth/getDate) - nunca UTC explicito. Essa e a mesma
// convencao que a Etapa 3 ja usava para "mes anterior" etc.; nao ha TZ
// explicito em docker-compose.yml/.env.example, entao o comportamento em
// producao depende do fuso do host onde o processo roda. Mantido de
// proposito identico entre /financeiro e /dashboard (Etapa 4) - ver teste
// "lancamento perto da meia-noite" em period.test.ts. Essa dependencia do
// fuso do host e uma limitacao de escopo conhecida, nao resolvida nesta
// etapa (ver relatorio final).
export type PeriodKey =
  | "TODAY"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "LAST_7_DAYS"
  | "LAST_30_DAYS"
  | "LAST_90_DAYS"
  | "LAST_3_MONTHS"
  | "LAST_6_MONTHS"
  | "THIS_YEAR"
  | "LAST_YEAR"
  | "CUSTOM";

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "TODAY", label: "Hoje" },
  { value: "THIS_MONTH", label: "Este mês" },
  { value: "LAST_MONTH", label: "Mês anterior" },
  { value: "LAST_7_DAYS", label: "Últimos 7 dias" },
  { value: "LAST_30_DAYS", label: "Últimos 30 dias" },
  { value: "LAST_90_DAYS", label: "Últimos 90 dias" },
  { value: "LAST_3_MONTHS", label: "Últimos 3 meses" },
  { value: "LAST_6_MONTHS", label: "Últimos 6 meses" },
  { value: "THIS_YEAR", label: "Este ano" },
  { value: "LAST_YEAR", label: "Ano anterior" },
  { value: "CUSTOM", label: "Personalizado" },
];

export const DEFAULT_PERIOD: PeriodKey = "THIS_MONTH";

export type MonthRef = { year: number; month: number }; // month: 0-11

// "month": o range cobre um numero inteiro de meses civis a partir do dia 1
// (THIS_MONTH, LAST_MONTH, LAST_3/6_MONTHS, THIS_YEAR, LAST_YEAR). "day": o
// range e delimitado por dias soltos, mesmo que por coincidencia comece no
// dia 1 (TODAY, LAST_7/30/90_DAYS, CUSTOM). Campo explicito porque inferir
// isso so a partir de `start.getDate() === 1` da falso positivo: TODAY caindo
// no dia 1o de um mes, ou LAST_7_DAYS quando "hoje" e dia 7, tambem tem
// start.getDate() === 1 sem serem, de fato, "o mes inteiro" - ver os testes
// de colisao em period.test.ts.
export type PeriodAlignment = "month" | "day";

export type PeriodRange = {
  start: Date;
  end: Date; // exclusivo
  months: MonthRef[];
  alignment: PeriodAlignment;
};

export type CustomRange = { start: Date; end: Date }; // end inclusivo (data escolhida pelo usuario)

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1, 0, 0, 0, 0);
}

// Exportado (Etapa 5) para o modulo de Contas a Pagar/Receber derivar
// "atrasado" (status PENDING + dueDate < hoje) com a MESMA nocao de "hoje"
// usada em todo o resto do financeiro/dashboard - nunca uma segunda
// convencao de data independente (ver deriveBillStatus em
// src/lib/finance/bills/status.ts).
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

// Exportado porque o servico do dashboard (Etapa 4) precisa dos mesmos meses
// civis cobertos por um range arbitrario (ex.: o range de comparacao) para
// buscar a serie mensal equivalente - ver getMonthlySeriesForRange em
// queries.ts. Usa o ultimo instante realmente incluido no range
// (endExclusive - 1ms) para achar o mes final - se comparassemos direto com
// endExclusive, um fim de range que cai no meio de um mes (ex.: dia 6)
// excluiria esse mes inteiro por engano.
export function monthsBetween(start: Date, endExclusive: Date): MonthRef[] {
  const months: MonthRef[] = [];
  let year = start.getFullYear();
  let month = start.getMonth();
  const inclusiveEnd = new Date(endExclusive.getTime() - 1);
  const endIndex = inclusiveEnd.getFullYear() * 12 + inclusiveEnd.getMonth();

  while (year * 12 + month <= endIndex) {
    months.push({ year, month });
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return months;
}

function monthsBack(year: number, month: number, count: number): PeriodRange {
  const start = startOfMonth(year, month - (count - 1));
  const end = startOfMonth(year, month + 1);
  const months: MonthRef[] = Array.from({ length: count }, (_, i) => {
    const d = new Date(year, month - (count - 1) + i, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  return { start, end, months, alignment: "month" };
}

// Range de N dias terminando hoje (inclusive) - usado por LAST_7/30/90_DAYS.
// `end` e sempre "inicio de amanha" (meia-noite do dia seguinte a hoje), ou
// seja, cobre o dia de hoje inteiro. Sempre alignment "day", mesmo quando
// `start` cai por coincidencia no dia 1 de um mes.
function lastNDaysRange(now: Date, days: number): PeriodRange {
  const todayStart = startOfDay(now);
  const start = addDays(todayStart, -(days - 1));
  const end = addDays(todayStart, 1);
  return { start, end, months: monthsBetween(start, end), alignment: "day" };
}

// `customRange` so e usado (e obrigatorio) quando period === "CUSTOM". O `end`
// do range custom e tratado como inclusivo (o usuario escolhe "ate" um dia),
// entao internamente somamos 1 dia para virar o limite exclusivo usado nas
// queries.
export function resolvePeriodRange(
  period: PeriodKey,
  now: Date = new Date(),
  customRange?: CustomRange
): PeriodRange {
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (period) {
    case "TODAY": {
      const start = startOfDay(now);
      const end = addDays(start, 1);
      return { start, end, months: monthsBetween(start, end), alignment: "day" };
    }
    case "THIS_MONTH": {
      const start = startOfMonth(year, month);
      const end = startOfMonth(year, month + 1);
      return { start, end, months: [{ year, month }], alignment: "month" };
    }
    case "LAST_MONTH": {
      const start = startOfMonth(year, month - 1);
      const end = startOfMonth(year, month);
      return {
        start,
        end,
        months: [{ year: start.getFullYear(), month: start.getMonth() }],
        alignment: "month",
      };
    }
    case "LAST_7_DAYS":
      return lastNDaysRange(now, 7);
    case "LAST_30_DAYS":
      return lastNDaysRange(now, 30);
    case "LAST_90_DAYS":
      return lastNDaysRange(now, 90);
    case "LAST_3_MONTHS":
      return monthsBack(year, month, 3);
    case "LAST_6_MONTHS":
      return monthsBack(year, month, 6);
    case "THIS_YEAR": {
      const start = new Date(year, 0, 1);
      const end = new Date(year + 1, 0, 1);
      const months: MonthRef[] = Array.from({ length: month + 1 }, (_, i) => ({ year, month: i }));
      return { start, end, months, alignment: "month" };
    }
    case "LAST_YEAR": {
      const start = new Date(year - 1, 0, 1);
      const end = new Date(year, 0, 1);
      const months: MonthRef[] = Array.from({ length: 12 }, (_, i) => ({ year: year - 1, month: i }));
      return { start, end, months, alignment: "month" };
    }
    case "CUSTOM": {
      if (!customRange) {
        throw new Error("customRange é obrigatório quando period é CUSTOM.");
      }
      const start = new Date(
        customRange.start.getFullYear(),
        customRange.start.getMonth(),
        customRange.start.getDate()
      );
      const endExclusive = new Date(
        customRange.end.getFullYear(),
        customRange.end.getMonth(),
        customRange.end.getDate() + 1
      );
      // "day" sempre, mesmo quando o intervalo escolhido comeca no dia 1 e
      // cobre meses inteiros - e um range arbitrario do usuario, nao um mes
      // civil, entao "periodo anterior"/"mesmo periodo ano anterior" devem
      // deslocar por duracao exata, nao por mes.
      return { start, end: endExclusive, months: monthsBetween(start, endExclusive), alignment: "day" };
    }
    default: {
      // Checagem de exaustividade em tempo de compilacao: se um novo
      // PeriodKey for adicionado sem um case aqui, o TypeScript acusa erro
      // nesta linha (period deixa de ser atribuivel a `never`).
      const exhaustiveCheck: never = period;
      throw new Error(`Período não tratado: ${exhaustiveCheck}`);
    }
  }
}

// Le start/end (yyyy-mm-dd) vindos de searchParams. Retorna undefined se
// nao forem duas datas validas - o chamador deve tratar isso como "sem
// range custom valido" (ex.: cair de volta pro DEFAULT_PERIOD).
export function parseCustomRangeParams(start: string | null, end: string | null): CustomRange | undefined {
  if (!start || !end) return undefined;
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return undefined;
  if (startDate.getTime() > endDate.getTime()) return undefined;
  return { start: startDate, end: endDate };
}

// Periodo anterior = intervalo imediatamente anterior, de mesma duracao
// (secao 16 do prompt da Etapa 3). Para os periodos com alignment "month"
// (THIS_MONTH, LAST_MONTH, LAST_3/6_MONTHS, THIS_YEAR, LAST_YEAR), "mesma
// duracao" significa o mesmo NUMERO DE MESES civis, nao os mesmos
// milissegundos: meses tem tamanhos diferentes (28-31 dias), entao subtrair
// milissegundos faria "mes anterior" cair no dia errado (ex.: fevereiro tem
// menos dias que marco). Para alignment "day" (TODAY, LAST_7/30/90_DAYS,
// CUSTOM) usamos subtracao por duracao em milissegundos - inclusive quando
// esses ranges comecam, por coincidencia, no dia 1 de um mes (por isso a
// checagem usa `range.alignment`, nao `range.start.getDate() === 1`).
export function getPreviousPeriodRange(range: PeriodRange): { start: Date; end: Date } {
  if (range.alignment === "month" && range.months.length > 0) {
    const monthCount = range.months.length;
    const start = new Date(range.start.getFullYear(), range.start.getMonth() - monthCount, 1);
    return { start, end: range.start };
  }

  const durationMs = range.end.getTime() - range.start.getTime();
  return {
    start: new Date(range.start.getTime() - durationMs),
    end: range.start,
  };
}

export type ComparisonMode = "PREVIOUS_PERIOD" | "SAME_PERIOD_LAST_YEAR" | "NONE";

export const COMPARISON_OPTIONS: { value: ComparisonMode; label: string }[] = [
  { value: "PREVIOUS_PERIOD", label: "Período anterior" },
  { value: "SAME_PERIOD_LAST_YEAR", label: "Mesmo período do ano anterior" },
  { value: "NONE", label: "Sem comparação" },
];

export const DEFAULT_COMPARISON: ComparisonMode = "PREVIOUS_PERIOD";

// "Mesmo periodo do ano anterior" (secao 23 da Etapa 4). Para alignment
// "month", subtrai 1 do ANO CIVIL de cada mes da lista `months` - nunca
// subtrai por dias, entao 29/fev NUNCA entra em jogo nesse caminho
// (comparamos meses inteiros, nao dias). Para alignment "day" (TODAY,
// LAST_7/30/90_DAYS, CUSTOM), desloca start/end com `new Date(y-1, m, d)`; a
// normalizacao nativa do Date (29/fev de ano bissexto vira 1/mar no ano
// anterior nao-bissexto, que nao tem 29/fev) e aceita e coberta por teste -
// nao existe uma data "correta" alternativa para esse caso.
function getSameRangeLastYear(range: PeriodRange): { start: Date; end: Date } {
  if (range.alignment === "month" && range.months.length > 0) {
    const firstMonth = range.months[0];
    const lastMonth = range.months[range.months.length - 1];
    const start = startOfMonth(firstMonth.year - 1, firstMonth.month);
    const end = startOfMonth(lastMonth.year - 1, lastMonth.month + 1);
    return { start, end };
  }

  const shiftYear = (d: Date) => new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());
  return { start: shiftYear(range.start), end: shiftYear(range.end) };
}

export function resolveComparisonRange(
  mode: ComparisonMode,
  range: PeriodRange
): { start: Date; end: Date } | null {
  switch (mode) {
    case "NONE":
      return null;
    case "PREVIOUS_PERIOD":
      return getPreviousPeriodRange(range);
    case "SAME_PERIOD_LAST_YEAR":
      return getSameRangeLastYear(range);
    default: {
      const exhaustiveCheck: never = mode;
      throw new Error(`Modo de comparação não tratado: ${exhaustiveCheck}`);
    }
  }
}
