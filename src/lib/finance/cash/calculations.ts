import { Prisma } from "@prisma/client";
import { summarizeEntries, type FinancialEntryLike } from "@/lib/finance/calculations";

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
// FinancialEntry com occurredAt ESTRITAMENTE POSTERIOR a openingBalanceDate.
// Lancamentos anteriores OU NA PROPRIA DATA de openingBalanceDate ja estao
// embutidos no saldo inicial e NUNCA entram de novo aqui - contar os dois
// duplicaria valor.
//
// Entries aqui devem ser SEMPRE todos os FinancialEntry realizados,
// independente de source (MANUAL/IMPORT/RECURRING/BILL - todos representam
// dinheiro que ja mudou de mãos) - NUNCA inclua Bill com status PENDING, que
// e exclusivamente o dominio do "Saldo previsto" (bills/queries.ts,
// getForecastBalance), um conceito FUTURO/PROJETADO diferente deste, que e
// HISTORICO/REALIZADO.
export type CashEntryLike = FinancialEntryLike & { occurredAt: Date };

export function calculateAccumulatedBalance(
  openingBalance: Decimal,
  openingBalanceDate: Date,
  entries: CashEntryLike[]
): Decimal {
  const qualifying = entries.filter((e) => e.occurredAt.getTime() > openingBalanceDate.getTime());
  const { netProfit } = summarizeEntries(qualifying);
  return openingBalance.plus(netProfit);
}
