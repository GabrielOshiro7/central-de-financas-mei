import { Prisma, type SaleStatus, type BillStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { compareKeys, toDateKey, todayKey, type BusinessClock } from "@/lib/time/zoned";

const { Decimal } = Prisma;

export type ClientFilters = {
  search?: string;
  status?: "ACTIVE" | "INACTIVE" | "ALL";
  city?: string;
  country?: string;
  page?: number;
  pageSize?: number;
};

// Nunca aceita businessId vindo do cliente - sempre resolvido a partir da
// sessao autenticada no server component/route chamador (mesmo padrao de
// listBills/listTransactions). Filtros "período de compra", "faixa de
// faturamento" e "com/sem vendas" (sugeridos no prompt como "quando fizer
// sentido") foram deliberadamente deixados fora desta lista - dependem de
// agregar vendas por cliente, o que a pagina de perfil ja calcula sob
// demanda (getClientCommercialSummary) mas que aqui exigiria uma segunda
// consulta agregada por linha da lista inteira a cada filtro; documentado
// como redução de escopo consciente, não esquecimento.
export async function listClients(
  businessId: string,
  filters: ClientFilters
): Promise<{ items: Awaited<ReturnType<typeof prisma.client.findMany>>; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
  const status = filters.status ?? "ACTIVE";

  const where: Prisma.ClientWhereInput = {
    businessId,
    ...(status === "ACTIVE" ? { active: true } : status === "INACTIVE" ? { active: false } : {}),
    ...(filters.city ? { city: { contains: filters.city, mode: "insensitive" } } : {}),
    ...(filters.country ? { country: { contains: filters.country, mode: "insensitive" } } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" } },
            { tradeName: { contains: filters.search, mode: "insensitive" } },
            { phone: { contains: filters.search, mode: "insensitive" } },
            { whatsapp: { contains: filters.search, mode: "insensitive" } },
            { email: { contains: filters.search, mode: "insensitive" } },
            { document: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.client.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

// Usado pelo seletor de cliente ao lançar uma venda nova - só clientes
// ativos aparecem por padrão (secao "STATUS DO CLIENTE" do prompt: inativo
// não deve ser opção padrão para novas vendas, mas continua válido/visível
// no restante do sistema).
export async function listVisibleClients(businessId: string, search?: string) {
  return prisma.client.findMany({
    where: {
      businessId,
      active: true,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { tradeName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 50,
  });
}

export async function getClientById(businessId: string, id: string) {
  return prisma.client.findFirst({ where: { id, businessId } });
}

export type ClientSalesSummary = { salesCount: number; lastPurchaseAt: Date | null };

// Usado pela coluna "Total de vendas"/"Última venda" da listagem de clientes.
// UMA UNICA query para a pagina inteira (findMany com clientId IN [...ids] +
// reducao em memoria) - nunca uma consulta por linha (evita N+1, mesmo
// principio ja aplicado no resto do modulo financeiro).
export async function getClientsSalesSummaryMap(
  businessId: string,
  clientIds: string[]
): Promise<Map<string, ClientSalesSummary>> {
  const map = new Map<string, ClientSalesSummary>();
  if (clientIds.length === 0) return map;

  const sales = await prisma.sale.findMany({
    where: { businessId, clientId: { in: clientIds }, status: { in: ["CONFIRMED", "COMPLETED"] } },
    select: { clientId: true, saleDate: true },
  });

  for (const sale of sales) {
    const existing = map.get(sale.clientId);
    if (existing) {
      existing.salesCount += 1;
      if (sale.saleDate.getTime() > (existing.lastPurchaseAt?.getTime() ?? -Infinity)) {
        existing.lastPurchaseAt = sale.saleDate;
      }
    } else {
      map.set(sale.clientId, { salesCount: 1, lastPurchaseAt: sale.saleDate });
    }
  }

  return map;
}

export async function hasAnyClientsEver(businessId: string): Promise<boolean> {
  const first = await prisma.client.findFirst({ where: { businessId }, select: { id: true } });
  return first !== null;
}

export type ClientCommercialSummary = {
  totalPurchased: Prisma.Decimal;
  salesCount: number;
  averageTicket: Prisma.Decimal | null;
  firstPurchaseAt: Date | null;
  lastPurchaseAt: Date | null;
};

// So conta vendas CONFIRMED/COMPLETED (uma venda cancelada nunca representa
// faturamento real; um rascunho ainda nao aconteceu) - mesmo raciocinio de
// "cancelada não é considerada no faturamento válido" do prompt (Cenário 3).
// Calculado via findMany com select minimo + reducao em memoria, igual ao
// resto do modulo financeiro (getFinancialSummaryForRange/
// summarizeByCategory) - nunca groupBy, para bater com o padrão já
// estabelecido no restante do código (ver também a nota equivalente em
// src/lib/sales/queries.ts para os rankings agregados por toda a empresa).
export async function getClientCommercialSummary(
  businessId: string,
  clientId: string
): Promise<ClientCommercialSummary> {
  const sales = await prisma.sale.findMany({
    where: { businessId, clientId, status: { in: ["CONFIRMED", "COMPLETED"] } },
    select: { total: true, saleDate: true },
    orderBy: { saleDate: "asc" },
  });

  if (sales.length === 0) {
    return { totalPurchased: new Decimal(0), salesCount: 0, averageTicket: null, firstPurchaseAt: null, lastPurchaseAt: null };
  }

  const totalPurchased = sales.reduce((total, s) => total.plus(s.total), new Decimal(0));
  const averageTicket = totalPurchased.div(sales.length);

  return {
    totalPurchased,
    salesCount: sales.length,
    averageTicket,
    firstPurchaseAt: sales[0].saleDate,
    lastPurchaseAt: sales[sales.length - 1].saleDate,
  };
}

export type ClientFinancialSummary = {
  totalOpenAmount: Prisma.Decimal; // pendente, ainda nao vencido
  totalOverdueAmount: Prisma.Decimal; // pendente e vencido
  totalReceivedAmount: Prisma.Decimal; // ja recebido (PAID)
};

// Mesma logica de bucket de getBillSummary (bills/queries.ts), so que
// escopada por cliente (via sale.clientId) em vez de direcao - RECEIVABLE e
// implicito aqui porque toda Bill gerada por uma venda usa uma categoria
// REVENUE (ver generateSaleBills).
// Vencido = dia de calendario antes de "hoje" no fuso da empresa (F3b).
export async function getClientFinancialSummary(
  businessId: string,
  clientId: string,
  clock: BusinessClock
): Promise<ClientFinancialSummary> {
  const bills = await prisma.bill.findMany({
    where: { businessId, sale: { clientId } },
    select: { amount: true, status: true, dueDate: true },
  });

  const today = todayKey(clock);
  let totalOpenAmount = new Decimal(0);
  let totalOverdueAmount = new Decimal(0);
  let totalReceivedAmount = new Decimal(0);

  for (const bill of bills) {
    if (bill.status === "PAID") {
      totalReceivedAmount = totalReceivedAmount.plus(bill.amount);
    } else if (bill.status === "PENDING") {
      if (compareKeys(toDateKey(bill.dueDate, clock.timeZone), today) < 0) {
        totalOverdueAmount = totalOverdueAmount.plus(bill.amount);
      } else {
        totalOpenAmount = totalOpenAmount.plus(bill.amount);
      }
    }
  }

  return { totalOpenAmount, totalOverdueAmount, totalReceivedAmount };
}

export type ClientHistoryItem = {
  saleId: string;
  saleNumber: number;
  saleDate: Date;
  status: SaleStatus;
  total: Prisma.Decimal;
  bills: { id: string; dueDate: Date; amount: Prisma.Decimal; status: BillStatus; paidAt: Date | null }[];
};

// Historico cronologico do cliente (vendas + parcelas + recebimentos) para
// o perfil do cliente - nunca apaga vendas/canceladas, so exibe o status.
export async function getClientHistory(businessId: string, clientId: string): Promise<ClientHistoryItem[]> {
  const sales = await prisma.sale.findMany({
    where: { businessId, clientId },
    orderBy: { saleDate: "desc" },
    include: { bills: { orderBy: { dueDate: "asc" }, select: { id: true, dueDate: true, amount: true, status: true, paidAt: true } } },
  });

  return sales.map((sale) => ({
    saleId: sale.id,
    saleNumber: sale.saleNumber,
    saleDate: sale.saleDate,
    status: sale.status,
    total: sale.total,
    bills: sale.bills,
  }));
}
