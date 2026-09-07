import { prisma } from "@/lib/db";
import {
  summarizeEntries,
  summarizeByCategory,
  type FinancialSummary,
  type CategoryBreakdownEntry,
} from "@/lib/finance/calculations";
import {
  resolvePeriodRange,
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

export async function getMonthlySeries(
  businessId: string,
  period: PeriodKey,
  now: Date = new Date(),
  customRange?: CustomRange
): Promise<MonthlyPoint[]> {
  const { months } = resolvePeriodRange(period, now, customRange);
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
