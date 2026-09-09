import type { MonthlyPoint, DailyPoint } from "@/lib/finance/queries";

// Forma generica de ponto de serie temporal, independente de granularidade
// (mes ou dia). MonthlyPoint (chave year+month) e DailyPoint (chave date) sao
// convertidos aqui pra essa forma comum - necessario desde que a Etapa 4
// introduziu periodos por dia (TODAY, LAST_7/30/90_DAYS, CUSTOM) que nao
// devem ser agrupados por mes inteiro (ver getDailySeriesForRange/
// getMonthlySeriesForRange em queries.ts e o comentario de alignment em
// period.ts) - vale tanto pro grafico principal de /dashboard quanto pro de
// /financeiro, que compartilham FinancialChart.
//
// Deliberadamente em um arquivo SEM "use client": toEvolutionPoints e
// chamada tanto de dashboardService.ts (server) quanto de financeiro/page.tsx
// (server component) - se ficasse dentro de FinancialChart.tsx (que precisa
// de "use client" pelo hover/tooltip), o Next trata todo export desse
// arquivo como client-only e a chamada do lado servidor quebra em runtime
// (bug real encontrado e corrigido nesta etapa - so pega em runtime, nao no
// build nem no tsc, porque e uma regra do bundler RSC, nao de tipos).
//
// Os 4 campos monetarios sao `number` (nao Prisma.Decimal): FinancialChart
// virou Client Component pra suportar hover/tooltip, e um `Decimal`
// (instancia de classe) nao pode atravessar a fronteira servidor->cliente
// (mesma regra ja documentada no CLAUDE.md pra EmpresaForm/Business) - o
// React aceita silenciosamente em dev e quebra em runtime quando o metodo
// .toNumber() e chamado do lado cliente sobre o objeto ja "achatado" pelo
// Flight. Mesmo padrao que TrendPoint.value (dashboardService.ts) ja usava.
export type EvolutionPoint = {
  key: string;
  label: string;
  revenue: number;
  costs: number;
  expenses: number;
  netProfit: number;
  hasAnyEntries: boolean;
};

export function toEvolutionPoints(points: (MonthlyPoint | DailyPoint)[]): EvolutionPoint[] {
  return points.map((p) => ({
    key: "month" in p ? `${p.year}-${p.month}` : p.date.toISOString(),
    label: p.label,
    revenue: p.revenue.toNumber(),
    costs: p.costs.toNumber(),
    expenses: p.expenses.toNumber(),
    netProfit: p.netProfit.toNumber(),
    hasAnyEntries: p.hasAnyEntries,
  }));
}
