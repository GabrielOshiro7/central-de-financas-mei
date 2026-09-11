import type { PeriodKey } from "@/lib/finance/period";

// Extraido para um arquivo sem "use client" (Etapa 5.1): CashPeriodFilter.tsx
// e "use client", e reexportar uma constante de la para o server component
// (caixa/page.tsx) quebra - Next trata TODO export de um modulo "use client"
// como referencia de cliente, mesmo um valor simples. Default proprio
// (LAST_6_MONTHS, nao o DEFAULT_PERIOD global de period.ts, que e
// THIS_MONTH) porque um grafico de "evolucao" com 1 unico ponto nao diz
// muita coisa.
export const DEFAULT_CASH_PERIOD: PeriodKey = "LAST_6_MONTHS";
