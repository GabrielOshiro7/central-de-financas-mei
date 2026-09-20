import Link from "next/link";
import type { Currency } from "@prisma/client";
import { AlertTriangle } from "lucide-react";
import { formatMoney } from "@/lib/money";
import type { CashBalance } from "@/lib/finance/cash/queries";

// Regra fundamental da Etapa 5.1: este numero e uma APROXIMACAO baseada nos
// lancamentos registrados (Receita - Custo - Despesa), NUNCA o saldo
// bancario real - diverge sempre que houver dinheiro que nao e receita/
// custo/despesa (aporte de capital, retirada de socio, emprestimo). O aviso
// abaixo e permanente (texto sempre visivel, nao um icone de tooltip) e
// nunca deve ser removido nem reduzido a um ⓘ escondido - e o requisito mais
// importante desta etapa.
export function CashBalanceCard({ cash, currency }: { cash: CashBalance; currency: Currency }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-sm text-gray-500 dark:text-neutral-400">Caixa atual (histórico e realizado)</p>
      <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-neutral-100">
        {formatMoney(cash.balance, currency)}
      </p>

      {/* Aviso permanente - NUNCA chamar isso de "saldo bancário"/"saldo real" */}
      <p className="mt-3 flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
        <AlertTriangle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Saldo baseado nos lançamentos registrados no sistema — pode divergir do extrato bancário real. Aportes,
          retiradas de sócio e empréstimos não entram nesta conta.
        </span>
      </p>

      {!cash.configured && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
          <p>
            Saldo inicial não configurado — este valor assume saldo zero na data do primeiro lançamento (
            {cash.asOfDate.toLocaleDateString("pt-BR")}).
          </p>
          <Link href="/configuracoes#empresa" className="mt-1 inline-block font-medium underline">
            Configurar saldo inicial
          </Link>
        </div>
      )}

      {cash.configured && (
        <Link
          href="/configuracoes#empresa"
          className="mt-4 inline-block text-xs font-medium text-gray-500 underline dark:text-neutral-400"
        >
          Editar saldo inicial (configurado em {cash.asOfDate.toLocaleDateString("pt-BR")})
        </Link>
      )}
    </div>
  );
}
