import { prisma } from "@/lib/db";
import {
  summarizeEntries,
  summarizeByCategory,
  type FinancialSummary,
  type CategoryBreakdownEntry,
} from "@/lib/finance/calculations";
import {
  resolvePeriodRange,
  monthsBetween,
  type PeriodKey,
  type PeriodRange,
  type CustomRange,
} from "@/lib/finance/period";
import {
  addDays,
  compareKeys,
  monthRange,
  parseDateKey,
  startOfDayInstant,
  toDateKey,
  zonedParts,
  type BusinessClock,
  type DateKey,
  type TimeZone,
} from "@/lib/time/zoned";
import type { EntrySource, FinancialEntryType, Prisma } from "@prisma/client";

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Sempre recebe o businessId ja resolvido a partir da sessao autenticada no
// server component/route handler chamador - nunca aceita um id vindo do
// cliente aqui, para nao abrir brecha de acesso cruzado entre usuarios.
export async function getFinancialSummaryForRange(
  businessId: string,
  range: { start: Date; end: Date }
): Promise<FinancialSummary> {
  const entries = await prisma.financialEntry.findMany({
    where: { businessId, occurredAt: { gte: range.start, lt: range.end } },
    select: { type: true, amount: true },
  });

  return summarizeEntries(entries);
}

export async function getFinancialSummary(
  businessId: string,
  period: PeriodKey,
  clock: BusinessClock,
  customRange?: CustomRange
): Promise<FinancialSummary> {
  const { start, end } = resolvePeriodRange(period, clock, customRange);
  return getFinancialSummaryForRange(businessId, { start, end });
}

export type MonthlyPoint = FinancialSummary & {
  year: number;
  month: number;
  label: string;
};

// Variante por range (em vez de PeriodKey) - o servico do dashboard (Etapa
// 4) precisa da serie mensal tanto do periodo atual quanto do periodo de
// comparacao "mesmo periodo do ano anterior" (que nao tem um PeriodKey
// correspondente - vem de resolveComparisonRange como {start, end} puro).
// getMonthlySeries (abaixo) delega pra cá, entao nao ha logica duplicada.
// So deve ser usada para ranges com alignment "month" (THIS_MONTH,
// LAST_3/6_MONTHS, THIS_YEAR, LAST_YEAR) - para alignment "day" use
// getDailySeriesForRange, senao a serie agrupa por mes inteiro em vez dos
// dias realmente dentro do periodo escolhido. Meses resolvidos no fuso da
// empresa (`timeZone`), nunca no fuso do processo.
export async function getMonthlySeriesForRange(
  businessId: string,
  range: { start: Date; end: Date },
  timeZone: TimeZone
): Promise<MonthlyPoint[]> {
  const months = monthsBetween(range.start, range.end, timeZone);
  if (months.length === 0) return [];
  const first = months[0];
  const last = months[months.length - 1];

  const entries = await prisma.financialEntry.findMany({
    where: {
      businessId,
      occurredAt: {
        gte: monthRange(first.year, first.month + 1, timeZone).start,
        lt: monthRange(last.year, last.month + 1, timeZone).end,
      },
    },
    select: { type: true, amount: true, occurredAt: true },
  });

  const byMonth = new Map<string, typeof entries>();
  for (const entry of entries) {
    const { year, month } = zonedParts(entry.occurredAt, timeZone);
    const key = `${year}-${month - 1}`;
    byMonth.set(key, [...(byMonth.get(key) ?? []), entry]);
  }

  return months.map(({ year, month }) => ({
    year,
    month,
    label: MONTH_LABELS[month],
    ...summarizeEntries(byMonth.get(`${year}-${month}`) ?? []),
  }));
}

export async function getMonthlySeries(
  businessId: string,
  period: PeriodKey,
  clock: BusinessClock,
  customRange?: CustomRange
): Promise<MonthlyPoint[]> {
  const { start, end } = resolvePeriodRange(period, clock, customRange);
  return getMonthlySeriesForRange(businessId, { start, end }, clock.timeZone);
}

export type DailyPoint = FinancialSummary & {
  date: Date;
  label: string; // "dd/mm"
};

// Contraparte de getMonthlySeriesForRange para ranges com alignment "day"
// (TODAY, LAST_7/30/90_DAYS, CUSTOM - ver period.ts). Agrupar esses por mes
// inteiro somaria dias fora do periodo escolhido pelo usuario e divergiria
// do valor exato que getFinancialSummaryForRange mostra pro mesmo periodo
// nos cards do topo - por isso a granularidade aqui e por DIA, nao por mes.
// Quem decide qual das duas funcoes chamar e o alignment do PeriodRange
// resolvido, nunca uma estimativa por duracao em dias. Dias de calendario no
// fuso da empresa (`timeZone`); `date` e o primeiro instante de cada dia.
export async function getDailySeriesForRange(
  businessId: string,
  range: { start: Date; end: Date },
  timeZone: TimeZone
): Promise<DailyPoint[]> {
  const entries = await prisma.financialEntry.findMany({
    where: { businessId, occurredAt: { gte: range.start, lt: range.end } },
    select: { type: true, amount: true, occurredAt: true },
  });

  const byDay = new Map<DateKey, typeof entries>();
  for (const entry of entries) {
    const key = toDateKey(entry.occurredAt, timeZone);
    byDay.set(key, [...(byDay.get(key) ?? []), entry]);
  }

  const points: DailyPoint[] = [];
  const endKey = toDateKey(range.end, timeZone);
  for (let key = toDateKey(range.start, timeZone); compareKeys(key, endKey) < 0; key = addDays(key, 1)) {
    const { month, day } = parseDateKey(key);
    const label = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
    points.push({ date: startOfDayInstant(key, timeZone), label, ...summarizeEntries(byDay.get(key) ?? []) });
  }
  return points;
}

// Distingue "empresa nunca lancou nada" (empty state real, secao 27 da
// Etapa 4) de "este periodo especifico esta vazio" (os MetricCards ja
// tratam isso individualmente com "Sem dados"). findFirst com select minimo
// e mais barato que count() para essa checagem booleana.
export async function hasAnyFinancialEntriesEver(businessId: string): Promise<boolean> {
  const first = await prisma.financialEntry.findFirst({ where: { businessId }, select: { id: true } });
  return first !== null;
}

// Usado pela Etapa 7 (Insights) para decidir "inicio frio" de forma
// deliberadamente DESACOPLADA de qualquer recorte de periodo: uma empresa
// cujo faturamento se concentra no fim do mes teria, no inicio de um mes
// novo, um recorte "dia 1 ate hoje" do mes anterior vazio por coincidencia
// de timing - isso NAO e a mesma coisa que "nunca teve nenhum lancamento
// antes". Ver src/lib/insights/snapshot.ts.
export async function hasFinancialEntriesBefore(businessId: string, date: Date): Promise<boolean> {
  const first = await prisma.financialEntry.findFirst({
    where: { businessId, occurredAt: { lt: date } },
    select: { id: true },
  });
  return first !== null;
}

// Distribuicao por categoria de um unico tipo (custo ou despesa) no periodo -
// alimenta os graficos 2/3 e o alerta de categoria concentrada (secao 20).
export async function getCategoryBreakdown(
  businessId: string,
  range: { start: Date; end: Date },
  type: Extract<FinancialEntryType, "COST" | "EXPENSE">
): Promise<CategoryBreakdownEntry[]> {
  const entries = await prisma.financialEntry.findMany({
    where: { businessId, type, occurredAt: { gte: range.start, lt: range.end } },
    select: { categoryId: true, amount: true, category: { select: { name: true } } },
  });

  return summarizeByCategory(
    entries.map((e) => ({ categoryId: e.categoryId, categoryName: e.category.name, amount: e.amount }))
  );
}

export type TransactionFilters = {
  type?: FinancialEntryType;
  categoryId?: string;
  source?: EntrySource;
  range?: { start: Date; end: Date };
  page?: number;
  pageSize?: number;
};

export type TransactionListItem = Prisma.FinancialEntryGetPayload<{
  include: { category: { select: { id: true; name: true } } };
}>;

export async function listTransactions(
  businessId: string,
  filters: TransactionFilters
): Promise<{ items: TransactionListItem[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));

  const where: Prisma.FinancialEntryWhereInput = {
    businessId,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.range ? { occurredAt: { gte: filters.range.start, lt: filters.range.end } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.financialEntry.findMany({
      where,
      include: { category: { select: { id: true, name: true } } },
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.financialEntry.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

// Nunca aceite um "id" de lancamento sem tambem escopar por businessId - e
// assim que garantimos que o usuario A nao consulta/edita/exclui lancamentos
// da empresa de B (secao 27).
export async function getTransactionById(businessId: string, id: string) {
  return prisma.financialEntry.findFirst({
    where: { id, businessId },
    include: { category: { select: { id: true, name: true, type: true } } },
  });
}

export { type PeriodRange };
