"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

// Mesmo padrao de dashboard/error.tsx (Etapa 4) - tratamento de erro a nivel
// de rota.
export default function CaixaError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-rose-300 bg-white p-10 text-center dark:border-rose-900 dark:bg-neutral-900">
      <AlertTriangle size={32} strokeWidth={1.75} aria-hidden="true" />
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
          Não foi possível carregar os dados de caixa.
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
          Tente novamente em instantes. Se o problema persistir, entre em contato com o suporte.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        Tentar novamente
      </button>
    </div>
  );
}
