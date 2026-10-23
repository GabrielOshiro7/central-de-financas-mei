import { requireOnboardedUser } from "@/lib/auth/guards";
import { materializeRecurringEntries } from "@/lib/finance/recurring/materialize";
import { materializeRecurringBills } from "@/lib/finance/bills/materialize";
import { getCurrentCashBalance, getMonthlyCashSeries } from "@/lib/finance/cash/queries";
import { getForecastBalance } from "@/lib/finance/bills/queries";
import { PERIOD_OPTIONS, resolvePeriodRange, parseCustomRangeParams, type PeriodKey } from "@/lib/finance/period";
import { CashBalanceCard } from "@/components/caixa/CashBalanceCard";
import { CashForecastNote } from "@/components/caixa/CashForecastNote";
import { CashEmptyState } from "@/components/caixa/CashEmptyState";
import { CashPeriodFilter } from "@/components/caixa/CashPeriodFilter";
import { DEFAULT_CASH_PERIOD } from "@/components/caixa/constants";
import { TrendMiniChart, type TrendPoint } from "@/components/dashboard/TrendMiniChart";
import { clockFor } from "@/lib/time/zoned";

const VALID_PERIODS = new Set<string>(PERIOD_OPTIONS.map((o) => o.value));

// Aba "Caixa" (Etapa 5.1): posicao de caixa acumulada, HISTORICA/REALIZADA -
// nunca confundir com "Saldo previsto" (Etapa 5, futuro/projetado). Ver
// CashBalanceCard para o aviso permanente de divergencia do saldo bancario
// real (requisito mais importante desta etapa).
export default async function CaixaPage(props: PageProps<"/caixa">) {
  const { user, business } = await requireOnboardedUser();
  // Materializacao preguicosa (mesmo gatilho do dashboard/financeiro) - os
  // lancamentos recorrentes e as contas confirmadas precisam estar
  // materializados antes de qualquer leitura de FinancialEntry aqui.
  await materializeRecurringEntries(business.id, user.id);
  await materializeRecurringBills(business.id);

  const now = new Date();
  const searchParams = await props.searchParams;
  const periodParam = typeof searchParams.period === "string" ? searchParams.period : undefined;
  const period: PeriodKey = periodParam && VALID_PERIODS.has(periodParam) ? (periodParam as PeriodKey) : DEFAULT_CASH_PERIOD;

  const startParam = typeof searchParams.start === "string" ? searchParams.start : null;
  const endParam = typeof searchParams.end === "string" ? searchParams.end : null;
  const customRange = period === "CUSTOM" ? parseCustomRangeParams(startParam, endParam) : undefined;
  const effectivePeriod: PeriodKey = period === "CUSTOM" && !customRange ? DEFAULT_CASH_PERIOD : period;

  const [current, monthlySeries, forecast] = await Promise.all([
    getCurrentCashBalance(business.id, business),
    getMonthlyCashSeries(business.id, business, now),
    getForecastBalance(business.id, now),
  ]);

  // Estado vazio REAL (mesmo padrao do dashboard): nenhum lancamento E nenhum
  // saldo inicial configurado - nao ha base nenhuma pra calcular nada.
  if (!current) {
    return (
      <div className="flex flex-col gap-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Caixa</h1>
        <CashEmptyState />
      </div>
    );
  }

  // O filtro de periodo SO recorta quais meses da serie ja calculada
  // aparecem no grafico - o card de saldo atual (current, acima) nunca muda
  // com ele, sempre "ate hoje" (secao "INTERFACE" da Etapa 5.1).
  const range = resolvePeriodRange(effectivePeriod, clockFor(business, now), customRange);
  const visibleMonthKeys = new Set(range.months.map((m) => `${m.year}-${m.month}`));
  const visibleSeries = monthlySeries.filter((p) => visibleMonthKeys.has(`${p.year}-${p.month}`));

  const trendPoints: TrendPoint[] = visibleSeries.map((p) => ({ label: p.label, value: p.balance.toNumber() }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Caixa</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          Posição de caixa acumulada ao longo do tempo, como um extrato de conta corrente.
        </p>
      </div>

      <CashBalanceCard cash={current} currency={business.currency} />

      <CashForecastNote forecast={forecast} currency={business.currency} />

      <div>
        <CashPeriodFilter />
        <div className="mt-3">
          <TrendMiniChart
            title="Evolução do caixa"
            tooltip="Saldo acumulado ao final de cada mês, incluindo o saldo inicial."
            points={trendPoints}
            currency={business.currency}
          />
        </div>
      </div>
    </div>
  );
}
