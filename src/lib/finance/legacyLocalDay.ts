// LEGADO TEMPORARIO (Etapa F3a do plano de fuso): as duas funcoes abaixo
// ainda resolvem dia/mes no fuso LOCAL DO PROCESSO NODE. Sairam de
// src/lib/finance/period.ts (que agora usa so o fuso da empresa) sem mudar
// nada para quem ainda depende delas - vencimento de contas, vendas,
// clientes e caixa, todos migrados na F3b. Nao use em codigo novo; a F3b
// remove este arquivo.
import type { MonthRef } from "@/lib/finance/period";

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

// Mesma implementacao que period.ts tinha antes da F3a (usada so pelo caixa).
export function legacyLocalMonthsBetween(start: Date, endExclusive: Date): MonthRef[] {
  const months: MonthRef[] = [];
  let year = start.getFullYear();
  let month = start.getMonth();
  const inclusiveEnd = new Date(endExclusive.getTime() - 1);
  const endIndex = inclusiveEnd.getFullYear() * 12 + inclusiveEnd.getMonth();

  while (year * 12 + month <= endIndex) {
    months.push({ year, month });
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return months;
}
