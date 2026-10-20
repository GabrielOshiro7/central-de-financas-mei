import type { Currency } from "@prisma/client";
import { formatMoney } from "@/lib/money";
import type { BillDashboardIndicators } from "@/lib/finance/dashboardService";

// Integra os indicadores de Contas a Pagar/Receber (Etapa 5) ao dashboard
// gerencial existente (Etapa 4) - todos os valores vem de getBillSummary/
// getForecastBalance (bills/queries.ts), calculados pelo sistema, nunca por
// IA. "Saldo previsto" e rotulado explicitamente como PREVISAO - recebimentos
// futuros menos pagamentos futuros, NUNCA o saldo bancario real.
export function BillsForecastPanel({ bills, currency }: { bills: BillDashboardIndicators; currency: Currency }) {
  const { payable, receivable, forecast } = bills;
  const netPositive = !forecast.projectedNet.isNegative();

  return (
    <div className="border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Contas a pagar e a receber</h2>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          Previsão
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-medium uppercase text-gray-500 dark:text-neutral-400">A pagar</h3>
          <dl className="mt-2 flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600 dark:text-neutral-400">Vencido</dt>
              <dd className="font-medium text-rose-600 dark:text-rose-400">
                {formatMoney(payable.totalOverdueAmount, currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600 dark:text-neutral-400">Hoje</dt>
              <dd className="font-medium text-gray-900 dark:text-neutral-100">
                {formatMoney(payable.dueTodayAmount, currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600 dark:text-neutral-400">Próximos 7 dias</dt>
              <dd className="font-medium text-gray-900 dark:text-neutral-100">
                {formatMoney(payable.dueNext7Amount, currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600 dark:text-neutral-400">Próximos 30 dias</dt>
              <dd className="font-medium text-gray-900 dark:text-neutral-100">
                {formatMoney(payable.dueNext30Amount, currency)}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <h3 className="text-xs font-medium uppercase text-gray-500 dark:text-neutral-400">A receber</h3>
          <dl className="mt-2 flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600 dark:text-neutral-400">Vencido</dt>
              <dd className="font-medium text-rose-600 dark:text-rose-400">
                {formatMoney(receivable.totalOverdueAmount, currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600 dark:text-neutral-400">Hoje</dt>
              <dd className="font-medium text-gray-900 dark:text-neutral-100">
                {formatMoney(receivable.dueTodayAmount, currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600 dark:text-neutral-400">Próximos 7 dias</dt>
              <dd className="font-medium text-gray-900 dark:text-neutral-100">
                {formatMoney(receivable.dueNext7Amount, currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600 dark:text-neutral-400">Próximos 30 dias</dt>
              <dd className="font-medium text-gray-900 dark:text-neutral-100">
                {formatMoney(receivable.dueNext30Amount, currency)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between bg-gray-50 px-4 py-3 dark:bg-neutral-800/60">
        <div>
          <p className="text-xs text-gray-500 dark:text-neutral-400">
            Saldo previsto (previsão) = recebimentos futuros − pagamentos futuros. Não é o saldo bancário real.
          </p>
        </div>
        <p className={`text-lg font-semibold ${netPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
          {formatMoney(forecast.projectedNet, currency)}
        </p>
      </div>
    </div>
  );
}
