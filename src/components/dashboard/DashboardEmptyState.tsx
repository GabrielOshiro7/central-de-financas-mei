import Link from "next/link";
import { BarChart3 } from "lucide-react";

// Estado vazio REAL (secao 27 da Etapa 4): a empresa nunca lancou nada, em
// nenhum periodo - diferente de "este periodo especifico esta vazio", que os
// MetricCards ja tratam individualmente com "Sem dados" (secao 28).
export function DashboardEmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 border border-dashed border-gray-300 bg-white p-10 text-center dark:border-neutral-700 dark:bg-neutral-900">
      <BarChart3 size={32} strokeWidth={1.75} aria-hidden="true" />
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
          Seu dashboard ainda não possui dados suficientes
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
          Importe seus dados financeiros ou registre sua primeira movimentação para começar.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/financeiro/importar"
          className="bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Importar dados
        </Link>
        <Link
          href="/financeiro/receitas"
          className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Adicionar lançamento
        </Link>
      </div>
    </div>
  );
}
