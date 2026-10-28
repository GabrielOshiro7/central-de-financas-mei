import { Prisma } from "@prisma/client";
import { summarizeEntries, type FinancialEntryLike } from "@/lib/finance/calculations";
import { compareKeys, type DateKey } from "@/lib/time/zoned";

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

// Posicao de caixa (Etapa 5.1) = APROXIMACAO baseada nos lancamentos
// registrados (Receita - Custo - Despesa), NUNCA o saldo bancario real - ela
// diverge sempre que houver dinheiro que nao e receita/custo/despesa (aporte
// de capital, retirada de socio, emprestimo). Ver o aviso permanente na UI
// (CashBalanceCard) - este calculo NUNCA deve ser exibido sem esse aviso ao
// lado.
//
// saldo = openingBalance + soma do netProfit (reaproveitado de
// summarizeEntries, calculations.ts - nao recalculado aqui) de todos os
// FinancialEntry cujo DIA (occurredOn, Etapa F6a-2) e ESTRITAMENTE POSTERIOR
// ao dia do saldo inicial (openingBalanceOn). Lancamentos anteriores OU NO
// PROPRIO DIA do saldo inicial ja estao
// embutidos no saldo inicial e NUNCA entram de novo aqui - contar os dois
// duplicaria valor.
//
// Entries aqui devem ser SEMPRE todos os FinancialEntry realizados,
// independente de source (MANUAL/IMPORT/RECURRING/BILL - todos representam
// dinheiro que ja mudou de mãos) - NUNCA inclua Bill com status PENDING, que
// e exclusivamente o dominio do "Saldo previsto" (bills/queries.ts,
// getForecastBalance), um conceito FUTURO/PROJETADO diferente deste, que e
// HISTORICO/REALIZADO.
export type CashEntryLike = FinancialEntryLike & { occurredOn: DateKey };

export function calculateAccumulatedBalance(
  openingBalance: Decimal,
  openingBalanceDay: DateKey,
  entries: CashEntryLike[]
): Decimal {
  const qualifying = entries.filter((e) => compareKeys(e.occurredOn, openingBalanceDay) > 0);
  const { netProfit } = summarizeEntries(qualifying);
  return openingBalance.plus(netProfit);
}
