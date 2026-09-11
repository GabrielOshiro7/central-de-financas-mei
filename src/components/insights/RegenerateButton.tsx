"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Botao manual de "atualizar" (secao 27 do prompt da Etapa 7) - o UNICO
// gatilho que aciona a tentativa de reescrita por IA (POST
// /api/insights/regenerate). O GET usado pela pagina/painel nunca chama
// esta rota sozinho.
export function RegenerateButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/insights/regenerate", { method: "POST" });
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        setError(result.error ?? "Não foi possível atualizar os insights.");
        return;
      }
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
      >
        {pending ? "Atualizando..." : "Atualizar insights"}
      </button>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
