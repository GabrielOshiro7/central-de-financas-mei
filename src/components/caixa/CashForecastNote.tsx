import type { Currency } from "@prisma/client";
import { formatMoney } from "@/lib/money";
import type { ForecastBalance } from "@/lib/finance/bills/queries";

// Contraste deliberado com o card de Caixa (Etapa 5.1): Caixa e HISTORICO/
// REALIZADO (so lancamentos ja ocorridos); isto aqui e o mesmo "Saldo
// previsto" do dashboard (Etapa 5, baseado em Contas a Pagar/Receber
// PENDING) - FUTURO/PROJETADO. Reaproveita getForecastBalance
// (bills/queries.ts) sem recalcular nada - nunca soma os dois numeros num
// so, sempre lado a lado com rotulos separados.
export function CashForecastNote({ forecast, currency }: { forecast: ForecastBalance; currency: Currency }) {
  const netPositive = !forecast.projectedNet.isNegative();

  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase text-gray-500 dark:text-neutral-400">
          Previsão (contas a pagar/receber) — diferente do Caixa acima
        </p>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          Previsão
        </span>
      </div>
      <p
        className={`mt-1 text-lg font-semibold ${netPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
      >
        {formatMoney(forecast.projectedNet, currency)}
      </p>
      <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
        Recebimentos futuros − pagamentos futuros já cadastrados (contas pendentes). Não é o Caixa atual nem o
        saldo bancário — é uma projeção separada.
      </p>
    </div>
  );
}
