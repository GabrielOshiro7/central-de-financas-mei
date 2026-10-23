import Link from "next/link";
import type { SaleStatus } from "@prisma/client";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { resolvePeriodRange, PERIOD_OPTIONS, DEFAULT_PERIOD, type PeriodKey } from "@/lib/finance/period";
import { listSales, getSalesSummary, hasAnySalesEver } from "@/lib/sales/queries";
import { deriveSalePaymentStatus } from "@/lib/sales/calculations";
import { formatMoney } from "@/lib/money";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { SaleFilters } from "@/components/vendas/SaleFilters";
import { SaleTable, type SaleRow } from "@/components/vendas/SaleTable";
import { CREATE_BUTTON_CLASS, CreateButtonContent } from "@/components/CreateButton";
import { clockFor } from "@/lib/time/zoned";

type SearchParams = { [key: string]: string | string[] | undefined };

function paramString(searchParams: SearchParams, key: string): string | undefined {
  const value = searchParams[key];
  return typeof value === "string" ? value : undefined;
}

const VALID_PERIODS = new Set(PERIOD_OPTIONS.map((o) => o.value));
const VALID_STATUS = new Set<string>(["DRAFT", "CONFIRMED", "CANCELLED", "COMPLETED"]);

const newSaleButtonClass =
  "bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200";

export default async function VendasPage(props: PageProps<"/vendas">) {
  const searchParams = await props.searchParams;
  const { business } = await requireOnboardedUser();

  const now = new Date();
  const periodParam = paramString(searchParams, "period");
  const period = (periodParam && VALID_PERIODS.has(periodParam as PeriodKey) ? periodParam : DEFAULT_PERIOD) as PeriodKey;
  const clock = clockFor(business, now);
  const range = period === "CUSTOM" ? resolvePeriodRange(DEFAULT_PERIOD, clock) : resolvePeriodRange(period, clock);

  const search = paramString(searchParams, "q");
  const statusParam = paramString(searchParams, "status");
  const status = statusParam && VALID_STATUS.has(statusParam) ? (statusParam as SaleStatus) : undefined;

  const [{ items }, summary, hasAnyEver] = await Promise.all([
    listSales(business.id, { period: { start: range.start, end: range.end }, search, status, pageSize: 100 }),
    getSalesSummary(business.id, range, now),
    hasAnySalesEver(business.id),
  ]);

  const rows: SaleRow[] = items.map((sale) => ({
    id: sale.id,
    saleNumber: sale.saleNumber,
    clientName: sale.client.name,
    saleDateDisplay: sale.saleDate.toLocaleDateString("pt-BR"),
    total: sale.total.toString(),
    paymentMethod: sale.paymentMethod ?? "",
    status: sale.status,
    paymentStatus: deriveSalePaymentStatus(sale.bills, now),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Vendas</h1>
        {hasAnyEver && (
          <Link href="/vendas/nova" className={CREATE_BUTTON_CLASS}>
            <CreateButtonContent label="Nova venda" />
          </Link>
        )}
      </div>

      {!hasAnyEver ? (
        <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-gray-300 bg-white px-6 py-16 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
          <p>Nenhuma venda encontrada.</p>
          <Link href="/vendas/nova" className={newSaleButtonClass}>
            Registrar venda
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 sm:grid-cols-4">
            <MetricCard label="Vendas no período" value={String(summary.salesCount)} />
            <MetricCard label="Faturamento" value={formatMoney(summary.totalRevenue, business.currency)} />
            <MetricCard
              label="Ticket médio"
              value={summary.averageTicket ? formatMoney(summary.averageTicket, business.currency) : null}
            />
            <MetricCard label="Recebido no período" value={formatMoney(summary.totalReceived, business.currency)} />
          </div>
          <SaleFilters />
          <SaleTable rows={rows} currency={business.currency} />
        </>
      )}
    </div>
  );
}
