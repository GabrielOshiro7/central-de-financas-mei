"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

// Botao "Atualizar dados" (secao 5 da Etapa 4) chama router.refresh(), que
// re-executa o server component da pagina (nova busca de dados) sem recarregar
// a aplicacao inteira nem perder o estado de filtros na URL.
export function DashboardHeader({
  businessName,
  periodLabel,
  lastUpdatedLabel,
}: {
  businessName: string;
  periodLabel: string;
  lastUpdatedLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Visão Geral</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400">{businessName}</p>
        <p className="mt-1 text-xs text-gray-400 dark:text-neutral-500">
          {periodLabel} · Última atualização: {lastUpdatedLabel}
        </p>
      </div>
      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        disabled={isPending}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        {isPending ? "Atualizando…" : "Atualizar dados"}
      </button>
    </div>
  );
}
