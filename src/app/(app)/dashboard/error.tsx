"use client";

import { useEffect } from "react";

// Tratamento de erro a nivel de ROTA (secao 30 da Etapa 4), nao por bloco
// individual: toda a busca de dados da pagina acontece num unico
// Promise.all em getDashboardData (server component), entao uma falha em
// qualquer query ja derruba a renderizacao inteira antes de chegar nos
// componentes visuais - isolar cada bloco exigiria quebrar a pagina em
// Suspense boundaries separadas (streaming por componente), uma mudanca de
// arquitetura maior que o necessario agora. Registrado como trade-off
// consciente no relatorio final, nao como pendencia escondida.
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-rose-300 bg-white p-10 text-center dark:border-rose-900 dark:bg-neutral-900">
      <span className="text-3xl" aria-hidden="true">
        ⚠️
      </span>
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
          Não foi possível carregar os dados financeiros.
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
          Tente novamente em instantes. Se o problema persistir, entre em contato com o suporte.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
      >
        Tentar novamente
      </button>
    </div>
  );
}
