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
    <div className="border border-dashed border-gray-300 bg-gray-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/40">
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-neutral-400">
        Previsão de contas a pagar e a receber
      </p>
      <p
        className={`mt-1 text-lg font-semibold ${netPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
      >
        {formatMoney(forecast.projectedNet, currency)}
      </p>
      <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
        Recebimentos futuros − pagamentos futuros das contas pendentes. Não entra no Caixa acima nem é o saldo
        bancário.
      </p>
    </div>
  );
}
