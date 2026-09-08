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
  now: Date = new Date(),
  customRange?: CustomRange
): Promise<FinancialSummary> {
  const { start, end } = resolvePeriodRange(period, now, customRange);
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
// dias realmente dentro do periodo escolhido.
export async function getMonthlySeriesForRange(
  businessId: string,
  range: { start: Date; end: Date }
): Promise<MonthlyPoint[]> {
  const months = monthsBetween(range.start, range.end);
  if (months.length === 0) return [];
  const first = months[0];
  const last = months[months.length - 1];

  const entries = await prisma.financialEntry.findMany({
    where: {
      businessId,
      occurredAt: {
        gte: new Date(first.year, first.month, 1),
        lt: new Date(last.year, last.month + 1, 1),
      },
    },
    select: { type: true, amount: true, occurredAt: true },
  });

  return months.map(({ year, month }) => {
    const monthEntries = entries.filter(
      (e) => e.occurredAt.getFullYear() === year && e.occurredAt.getMonth() === month
    );
    return {
      year,
      month,
      label: MONTH_LABELS[month],
      ...summarizeEntries(monthEntries),
    };
  });
}

export async function getMonthlySeries(
  businessId: string,
  period: PeriodKey,
  now: Date = new Date(),
  customRange?: CustomRange
): Promise<MonthlyPoint[]> {
  const { start, end } = resolvePeriodRange(period, now, customRange);
  return getMonthlySeriesForRange(businessId, { start, end });
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
// resolvido, nunca uma estimativa por duracao em dias.
export async function getDailySeriesForRange(
  businessId: string,
  range: { start: Date; end: Date }
): Promise<DailyPoint[]> {
  const entries = await prisma.financialEntry.findMany({
    where: { businessId, occurredAt: { gte: range.start, lt: range.end } },
    select: { type: true, amount: true, occurredAt: true },
  });

  const days: Date[] = [];
  for (
    let cursor = new Date(range.start);
    cursor.getTime() < range.end.getTime();
    cursor.setDate(cursor.getDate() + 1)
  ) {
    days.push(new Date(cursor));
  }

  return days.map((date) => {
    const dayEntries = entries.filter(
      (e) =>
        e.occurredAt.getFullYear() === date.getFullYear() &&
        e.occurredAt.getMonth() === date.getMonth() &&
        e.occurredAt.getDate() === date.getDate()
    );
    const label = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { date, label, ...summarizeEntries(dayEntries) };
  });
}

// Distingue "empresa nunca lancou nada" (empty state real, secao 27 da
// Etapa 4) de "este periodo especifico esta vazio" (os MetricCards ja
// tratam isso individualmente com "Sem dados"). findFirst com select minimo
// e mais barato que count() para essa checagem booleana.
export async function hasAnyFinancialEntriesEver(businessId: string): Promise<boolean> {
  const first = await prisma.financialEntry.findFirst({ where: { businessId }, select: { id: true } });
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
