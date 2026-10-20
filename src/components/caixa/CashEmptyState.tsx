import Link from "next/link";
import { Landmark } from "lucide-react";

// Estado vazio REAL do Caixa (Etapa 5.1, mesmo padrao de DashboardEmptyState):
// nenhum lancamento financeiro E nenhum saldo inicial configurado ainda -
// nao ha base nenhuma pra calcular nada (ver resolveEffectiveOpeningBalance).
export function CashEmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center dark:border-neutral-700 dark:bg-neutral-900">
      <Landmark size={32} strokeWidth={1.75} aria-hidden="true" />
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
          Seu caixa ainda não tem dados suficientes
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
          Configure um saldo inicial ou registre seu primeiro lançamento financeiro para começar a acompanhar a
          posição de caixa.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/configuracoes#empresa"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Configurar saldo inicial
        </Link>
        <Link
          href="/financeiro/receitas"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Adicionar lançamento
        </Link>
      </div>
    </div>
  );
}
