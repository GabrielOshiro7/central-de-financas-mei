import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { type BillDirection, type BillDisplayStatus } from "@/lib/finance/bills/status";
import { addDays, compareKeys, startOfDayInstant, toDateKey, todayKey, type BusinessClock } from "@/lib/time/zoned";

const { Decimal } = Prisma;

function directionWhere(direction: BillDirection): Prisma.BillWhereInput {
  return direction === "PAYABLE"
    ? { category: { type: { in: ["COST", "EXPENSE"] } } }
    : { category: { type: "REVENUE" } };
}

// "OVERDUE" nunca e uma condicao persistida - vira status=PENDING + dueDate
// antes do inicio de "hoje" (00:00 do dia de calendario no fuso da EMPRESA,
// Etapa F3b), espelhando deriveBillStatus (bills/status.ts) do lado da query.
export function startOfBusinessToday(clock: BusinessClock): Date {
  return startOfDayInstant(todayKey(clock), clock.timeZone);
}

function displayStatusWhere(displayStatus: BillDisplayStatus, clock: BusinessClock): Prisma.BillWhereInput {
  const today = startOfBusinessToday(clock);
  switch (displayStatus) {
    case "PENDING":
      return { status: "PENDING", dueDate: { gte: today } };
    case "OVERDUE":
      return { status: "PENDING", dueDate: { lt: today } };
    case "PAID":
      return { status: "PAID" };
    case "CANCELLED":
      return { status: "CANCELLED" };
    default: {
      const exhaustiveCheck: never = displayStatus;
      throw new Error(`Status não tratado: ${exhaustiveCheck}`);
    }
  }
}

export type BillFilters = {
  direction: BillDirection;
  displayStatus?: BillDisplayStatus;
  categoryId?: string;
  search?: string;
  dueRange?: { start: Date; end: Date };
  amountMin?: number;
  amountMax?: number;
  page?: number;
  pageSize?: number;
};

export type BillListItem = Prisma.BillGetPayload<{
  include: { category: { select: { id: true; name: true; type: true } } };
}>;

// Nunca aceite um businessId vindo do cliente - sempre resolvido a partir da
// sessao autenticada no server component/route handler chamador (mesmo
// padrao de listTransactions em finance/queries.ts).
export async function listBills(
  businessId: string,
  filters: BillFilters,
  clock: BusinessClock
): Promise<{ items: BillListItem[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));

  const amountFilter =
    filters.amountMin !== undefined || filters.amountMax !== undefined
      ? {
          amount: {
            ...(filters.amountMin !== undefined ? { gte: filters.amountMin } : {}),
            ...(filters.amountMax !== undefined ? { lte: filters.amountMax } : {}),
          },
        }
      : {};

  const where: Prisma.BillWhereInput = {
    businessId,
    ...directionWhere(filters.direction),
    ...(filters.displayStatus ? displayStatusWhere(filters.displayStatus, clock) : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.dueRange ? { dueDate: { gte: filters.dueRange.start, lt: filters.dueRange.end } } : {}),
    ...amountFilter,
    ...(filters.search
      ? {
          OR: [
            { description: { contains: filters.search, mode: "insensitive" } },
            { counterpartyName: { contains: filters.search, mode: "insensitive" } },
            { documentNumber: { contains: filters.search, mode: "insensitive" } },
            { category: { name: { contains: filters.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.bill.findMany({
      where,
      include: { category: { select: { id: true, name: true, type: true } } },
      orderBy: { dueDate: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.bill.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getBillById(businessId: string, id: string) {
  return prisma.bill.findFirst({
    where: { id, businessId },
    include: {
      category: { select: { id: true, name: true, type: true } },
      financialEntry: { select: { id: true } },
    },
  });
}

export async function hasAnyBillsEver(businessId: string, direction: BillDirection): Promise<boolean> {
  const first = await prisma.bill.findFirst({
    where: { businessId, ...directionWhere(direction) },
    select: { id: true },
  });
  return first !== null;
}

export type BillSummary = {
  totalOpenAmount: Prisma.Decimal; // PENDING + OVERDUE (obrigacao futura, nao cancelada nem paga)
  totalOverdueAmount: Prisma.Decimal;
  totalPendingAmount: Prisma.Decimal; // PENDING e ainda nao vencida
  totalPaidAmount: Prisma.Decimal; // PAID com paidAt dentro de paidRange
  dueTodayAmount: Prisma.Decimal;
  dueTodayCount: number;
  dueNext7Amount: Prisma.Decimal;
  dueNext7Count: number;
  dueNext30Amount: Prisma.Decimal;
  dueNext30Count: number;
};

// Indicadores do topo da pagina de Contas (secao "DASHBOARD DO MODULO" da
// Etapa 5). totalOpen/Overdue/Pending refletem o estado ATUAL (nunca
// dependem do periodo selecionado - uma conta vencida continua vencida
// independente do filtro de periodo aplicado na tabela); so totalPaidAmount
// e recortado por `paidRange`, do mesmo jeito que o resto do financeiro usa
// PeriodKey para "quanto foi pago/recebido nesse periodo". Vencido / vence
// hoje / proximos 7 e 30 dias comparam DIAS DE CALENDARIO no fuso da empresa
// (dueDate convertido para a data do fuso; "hoje" = todayKey(clock)).
export async function getBillSummary(
  businessId: string,
  direction: BillDirection,
  paidRange: { start: Date; end: Date },
  clock: BusinessClock
): Promise<BillSummary> {
  const today = todayKey(clock);
  const tomorrow = addDays(today, 1);
  const next7End = addDays(today, 7);
  const next30End = addDays(today, 30);

  const [openBills, paidBills] = await Promise.all([
    prisma.bill.findMany({
      where: { businessId, status: "PENDING", ...directionWhere(direction) },
      select: { amount: true, dueDate: true },
    }),
    prisma.bill.findMany({
      where: {
        businessId,
        status: "PAID",
        ...directionWhere(direction),
        paidAt: { gte: paidRange.start, lt: paidRange.end },
      },
      select: { amount: true },
    }),
  ]);

  let totalOpenAmount = new Decimal(0);
  let totalOverdueAmount = new Decimal(0);
  let totalPendingAmount = new Decimal(0);
  let dueTodayAmount = new Decimal(0);
  let dueTodayCount = 0;
  let dueNext7Amount = new Decimal(0);
  let dueNext7Count = 0;
  let dueNext30Amount = new Decimal(0);
  let dueNext30Count = 0;

  for (const bill of openBills) {
    totalOpenAmount = totalOpenAmount.plus(bill.amount);
    const due = toDateKey(bill.dueDate, clock.timeZone);
    const notOverdue = compareKeys(due, today) >= 0;

    if (!notOverdue) {
      totalOverdueAmount = totalOverdueAmount.plus(bill.amount);
    } else {
      totalPendingAmount = totalPendingAmount.plus(bill.amount);
    }

    if (notOverdue && compareKeys(due, tomorrow) < 0) {
      dueTodayAmount = dueTodayAmount.plus(bill.amount);
      dueTodayCount += 1;
    }
    if (notOverdue && compareKeys(due, next7End) < 0) {
      dueNext7Amount = dueNext7Amount.plus(bill.amount);
      dueNext7Count += 1;
    }
    if (notOverdue && compareKeys(due, next30End) < 0) {
      dueNext30Amount = dueNext30Amount.plus(bill.amount);
      dueNext30Count += 1;
    }
  }

  const totalPaidAmount = paidBills.reduce((total, b) => total.plus(b.amount), new Decimal(0));

  return {
    totalOpenAmount,
    totalOverdueAmount,
    totalPendingAmount,
    totalPaidAmount,
    dueTodayAmount,
    dueTodayCount,
    dueNext7Amount,
    dueNext7Count,
    dueNext30Amount,
    dueNext30Count,
  };
}

// "Vencido referente ao mes X" (Etapa 7 - Insights) = bills PENDING cujo
// dueDate cai dentro de dueRange E que continuam vencidas HOJE (dueDate <
// hoje). Isto NAO e "o saldo vencido como estava no fim daquele mes" -
// Bill.status e um campo vivo, sem historico versionado, entao esse numero
// nao e reconstruivel; o que da para responder com precisao e "quanto do que
// venceu naquele periodo ainda nao foi resolvido, visto de hoje". Por isso
// este numero DIVERGE do totalOverdueAmount de getBillSummary (que reflete
// todo vencido agora, independente do mes de vencimento) - nunca confundir
// os dois na UI (ver InsightCard/evaluateReceivablesOverdue).
export async function getOverdueAmountForDueRange(
  businessId: string,
  direction: BillDirection,
  dueRange: { start: Date; end: Date },
  clock: BusinessClock
): Promise<Prisma.Decimal> {
  const today = todayKey(clock);
  const bills = await prisma.bill.findMany({
    where: {
      businessId,
      status: "PENDING",
      ...directionWhere(direction),
      dueDate: { gte: dueRange.start, lt: dueRange.end },
    },
    select: { amount: true, dueDate: true },
  });

  return bills
    .filter((b) => compareKeys(toDateKey(b.dueDate, clock.timeZone), today) < 0)
    .reduce((total, b) => total.plus(b.amount), new Decimal(0));
}

export type ForecastBalance = {
  upcomingReceivables: Prisma.Decimal;
  upcomingPayables: Prisma.Decimal;
  // Recebimentos futuros - pagamentos futuros. Rotulado explicitamente como
  // PREVISAO em toda a UI (secao "FLUXO DE CAIXA PREVISTO" da Etapa 5) -
  // NUNCA exibido como se fosse o saldo bancario real.
  projectedNet: Prisma.Decimal;
};

// Reaproveita getBillSummary para as duas direcoes em vez de duplicar a
// query de soma - paidRange vazio (start===end) porque so o total EM ABERTO
// interessa aqui, nunca o que ja foi pago/recebido.
export async function getForecastBalance(businessId: string, clock: BusinessClock): Promise<ForecastBalance> {
  const emptyRange = { start: clock.now, end: clock.now };
  const [payable, receivable] = await Promise.all([
    getBillSummary(businessId, "PAYABLE", emptyRange, clock),
    getBillSummary(businessId, "RECEIVABLE", emptyRange, clock),
  ]);

  return {
    upcomingReceivables: receivable.totalOpenAmount,
    upcomingPayables: payable.totalOpenAmount,
    projectedNet: receivable.totalOpenAmount.minus(payable.totalOpenAmount),
  };
}
