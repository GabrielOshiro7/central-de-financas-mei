import { Prisma, type SaleStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { compareKeys, toDateKey, todayKey, type BusinessClock } from "@/lib/time/zoned";

const { Decimal } = Prisma;

export type SaleFilters = {
  period?: { start: Date; end: Date };
  clientId?: string;
  status?: SaleStatus;
  paymentMethod?: string;
  paymentStatus?: "PENDING" | "RECEIVED";
  search?: string;
  amountMin?: number;
  amountMax?: number;
  page?: number;
  pageSize?: number;
};

// Nunca aceita businessId vindo do cliente - mesmo padrao de listBills.
// `paymentStatus` e uma aproximacao pratica (nao usa deriveSalePaymentStatus
// exatamente, que distingue tambem PARCIAL/ATRASADA) - "PENDING" = tem ao
// menos uma parcela ainda pendente, "RECEIVED" = todas as parcelas existentes
// estao pagas; suficiente para o filtro da lista sem duplicar a logica de
// derivacao aqui.
export async function listSales(businessId: string, filters: SaleFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));

  const amountFilter =
    filters.amountMin !== undefined || filters.amountMax !== undefined
      ? {
          total: {
            ...(filters.amountMin !== undefined ? { gte: filters.amountMin } : {}),
            ...(filters.amountMax !== undefined ? { lte: filters.amountMax } : {}),
          },
        }
      : {};

  const searchNumber = filters.search ? Number(filters.search.replace(/\D/g, "")) : NaN;

  const where: Prisma.SaleWhereInput = {
    businessId,
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
    ...(filters.period ? { saleDate: { gte: filters.period.start, lt: filters.period.end } } : {}),
    ...(filters.paymentStatus === "PENDING" ? { bills: { some: { status: "PENDING" } } } : {}),
    ...(filters.paymentStatus === "RECEIVED" ? { bills: { some: { status: "PAID" }, none: { status: "PENDING" } } } : {}),
    ...amountFilter,
    ...(filters.search
      ? {
          OR: [
            { client: { name: { contains: filters.search, mode: "insensitive" } } },
            { items: { some: { description: { contains: filters.search, mode: "insensitive" } } } },
            ...(Number.isFinite(searchNumber) && searchNumber > 0 ? [{ saleNumber: searchNumber }] : []),
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        bills: { select: { id: true, status: true, dueDate: true } },
      },
      orderBy: { saleDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.sale.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getSaleById(businessId: string, id: string) {
  return prisma.sale.findFirst({
    where: { id, businessId },
    include: {
      client: true,
      category: { select: { id: true, name: true, type: true } },
      items: { include: { product: { select: { id: true, name: true } } } },
      bills: { orderBy: { dueDate: "asc" } },
    },
  });
}

export async function hasAnySalesEver(businessId: string): Promise<boolean> {
  const first = await prisma.sale.findFirst({ where: { businessId }, select: { id: true } });
  return first !== null;
}

export type SalesSummary = {
  salesCount: number;
  totalRevenue: Prisma.Decimal; // soma de Sale.total (CONFIRMED/COMPLETED) no periodo, por data da VENDA
  averageTicket: Prisma.Decimal | null;
  totalReceived: Prisma.Decimal; // soma de Bills PAID de vendas do periodo (nao cancelada)
  totalPending: Prisma.Decimal; // PENDING, ainda nao vencida
  totalOverdue: Prisma.Decimal; // PENDING e vencida
};

// Indicadores do topo da tela de Vendas / secao comercial do dashboard.
// findMany com select minimo + reducao em memoria, mesmo padrao de
// getFinancialSummaryForRange/getBillSummary - nunca groupBy (ver nota em
// getTopClients/getTopProducts abaixo, que documenta essa escolha).
export async function getSalesSummary(
  businessId: string,
  range: { start: Date; end: Date },
  clock: BusinessClock
): Promise<SalesSummary> {
  const [sales, bills] = await Promise.all([
    prisma.sale.findMany({
      where: { businessId, saleDate: { gte: range.start, lt: range.end }, status: { in: ["CONFIRMED", "COMPLETED"] } },
      select: { total: true },
    }),
    prisma.bill.findMany({
      where: {
        businessId,
        sale: { saleDate: { gte: range.start, lt: range.end }, status: { not: "CANCELLED" } },
      },
      select: { amount: true, status: true, dueDate: true },
    }),
  ]);

  const totalRevenue = sales.reduce((total, s) => total.plus(s.total), new Decimal(0));
  const salesCount = sales.length;
  const averageTicket = salesCount > 0 ? totalRevenue.dividedBy(salesCount) : null;

  // Vencido = dia de calendario antes de "hoje" no fuso da empresa (F3b).
  const today = todayKey(clock);
  let totalReceived = new Decimal(0);
  let totalPending = new Decimal(0);
  let totalOverdue = new Decimal(0);

  for (const bill of bills) {
    if (bill.status === "PAID") {
      totalReceived = totalReceived.plus(bill.amount);
    } else if (bill.status === "PENDING") {
      if (compareKeys(toDateKey(bill.dueDate, clock.timeZone), today) < 0) {
        totalOverdue = totalOverdue.plus(bill.amount);
      } else {
        totalPending = totalPending.plus(bill.amount);
      }
    }
  }

  return { salesCount, totalRevenue, averageTicket, totalReceived, totalPending, totalOverdue };
}

export type TopClientEntry = { clientId: string; clientName: string; totalPurchased: Prisma.Decimal; salesCount: number };

// Ranking "Top clientes" (secao da Etapa 6). DECISAO CONSCIENTE: calculado
// via findMany (select minimo: total + id/name do cliente) + agrupamento em
// memoria, e NAO via Prisma `groupBy`, mesmo o ADENDO da etapa pedindo
// agregacao no banco. Motivo: este codebase nao usa `groupBy` em NENHUM
// lugar do modulo financeiro hoje (getFinancialSummaryForRange,
// getMonthlySeriesForRange, summarizeByCategory - todos fazem findMany +
// reduce) - manter esse padrao existente foi julgado mais valioso do que
// introduzir um estilo de consulta novo so para esta feature. Fica
// registrado aqui como candidato a uma futura etapa de performance quando o
// volume real de dados justificar `groupBy` (ver relatorio de entrega da
// Etapa 6).
export async function getTopClients(
  businessId: string,
  range: { start: Date; end: Date },
  limit = 5
): Promise<TopClientEntry[]> {
  const sales = await prisma.sale.findMany({
    where: { businessId, saleDate: { gte: range.start, lt: range.end }, status: { in: ["CONFIRMED", "COMPLETED"] } },
    select: { total: true, client: { select: { id: true, name: true } } },
  });

  const totals = new Map<string, TopClientEntry>();
  for (const sale of sales) {
    const existing = totals.get(sale.client.id);
    if (existing) {
      existing.totalPurchased = existing.totalPurchased.plus(sale.total);
      existing.salesCount += 1;
    } else {
      totals.set(sale.client.id, {
        clientId: sale.client.id,
        clientName: sale.client.name,
        totalPurchased: sale.total,
        salesCount: 1,
      });
    }
  }

  return Array.from(totals.values())
    .sort((a, b) => b.totalPurchased.comparedTo(a.totalPurchased))
    .slice(0, limit);
}

export type TopProductEntry = {
  productId: string | null;
  productName: string;
  quantitySold: Prisma.Decimal;
  totalRevenue: Prisma.Decimal;
  salesCount: number;
};

// Mesma decisao/justificativa de getTopClients acima (findMany + reduce em
// memoria, nao groupBy - consistencia com o resto do modulo financeiro,
// documentado como tradeoff consciente). Itens sem productId (digitados
// livremente) sao agrupados por descricao normalizada - aproximacao
// razoavel, nao uma correspondencia exata (dois textos digitados de forma
// diferente para "o mesmo" produto aparecem como linhas separadas).
export async function getTopProducts(
  businessId: string,
  range: { start: Date; end: Date },
  limit = 5
): Promise<TopProductEntry[]> {
  const items = await prisma.saleItem.findMany({
    where: {
      sale: { businessId, saleDate: { gte: range.start, lt: range.end }, status: { in: ["CONFIRMED", "COMPLETED"] } },
    },
    select: { description: true, quantity: true, lineTotal: true, productId: true, saleId: true },
  });

  const totals = new Map<string, TopProductEntry & { saleIds: Set<string> }>();
  for (const item of items) {
    const key = item.productId ?? `desc:${item.description.trim().toLowerCase()}`;
    const existing = totals.get(key);
    if (existing) {
      existing.quantitySold = existing.quantitySold.plus(item.quantity);
      existing.totalRevenue = existing.totalRevenue.plus(item.lineTotal);
      existing.saleIds.add(item.saleId);
    } else {
      totals.set(key, {
        productId: item.productId,
        productName: item.description,
        quantitySold: item.quantity,
        totalRevenue: item.lineTotal,
        salesCount: 0,
        saleIds: new Set([item.saleId]),
      });
    }
  }

  return Array.from(totals.values())
    .map(({ saleIds, ...rest }) => ({ ...rest, salesCount: saleIds.size }))
    .sort((a, b) => b.totalRevenue.comparedTo(a.totalRevenue))
    .slice(0, limit);
}
