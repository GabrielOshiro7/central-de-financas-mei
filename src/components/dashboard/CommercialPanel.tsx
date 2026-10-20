import Link from "next/link";
import type { Currency } from "@prisma/client";
import { formatMoney } from "@/lib/money";
import type { CommercialDashboardIndicators } from "@/lib/finance/dashboardService";

// Secao comercial do dashboard (Etapa 6) - reaproveita os mesmos indicadores
// ja calculados por getSalesSummary/getTopClients (sales/queries.ts), nenhum
// calculo novo aqui. Faturamento aqui e SEMPRE o total de Sale.total das
// vendas confirmadas/concluidas no periodo - nunca confundir com o
// Faturamento do card principal do financeiro (que soma FinancialEntry de
// tipo REVENUE de qualquer origem, incluindo lancamentos manuais/importados
// sem venda associada); os dois podem legitimamente divergir.
export function CommercialPanel({ commercial, currency }: { commercial: CommercialDashboardIndicators; currency: Currency }) {
  return (
    <div className="border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Comercial</h2>
        <Link href="/vendas" className="text-xs font-medium text-gray-500 hover:underline dark:text-neutral-400">
          Ver vendas →
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-gray-500 dark:text-neutral-400">Vendas no período</dt>
          <dd className="text-lg font-semibold text-gray-900 dark:text-neutral-100">{commercial.salesCount}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500 dark:text-neutral-400">Faturamento em vendas</dt>
          <dd className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
            {formatMoney(commercial.totalRevenue, currency)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500 dark:text-neutral-400">Ticket médio</dt>
          <dd className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
            {commercial.averageTicket ? formatMoney(commercial.averageTicket, currency) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500 dark:text-neutral-400">Recebido no período</dt>
          <dd className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            {formatMoney(commercial.totalReceived, currency)}
          </dd>
        </div>
      </div>

      {commercial.topClients.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-medium uppercase text-gray-500 dark:text-neutral-400">Top clientes</h3>
          <ol className="mt-2 flex flex-col gap-1 text-sm">
            {commercial.topClients.map((client, index) => (
              <li key={client.clientId} className="flex justify-between">
                <span className="text-gray-700 dark:text-neutral-300">
                  {index + 1}. {client.clientName}
                </span>
                <span className="font-medium text-gray-900 dark:text-neutral-100">
                  {formatMoney(client.totalPurchased, currency)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
