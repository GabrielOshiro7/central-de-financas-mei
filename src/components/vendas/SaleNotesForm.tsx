"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SubmitButton } from "@/components/SubmitButton";

// Caminho de edicao para uma venda "travada" (ja tem parcela PAID) - so
// observacoes podem mudar (ADENDO item 2). A rota PATCH /api/vendas/[id] ja
// decide sozinha, com base no estado real da venda, se aceita este payload
// reduzido ou o completo - este componente so existe pra nao mostrar ao
// usuario campos que ele nao pode mais editar.
export function SaleNotesForm({ saleId, initialNotes }: { saleId: string; initialNotes: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/vendas/${saleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? "Não foi possível salvar.");
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-sm text-amber-700 dark:text-amber-400">
        Esta venda já tem parcela recebida - só é possível editar as observações.
      </p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
      />
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="w-40">
        <SubmitButton pending={pending} pendingText="Salvando...">
          Salvar
        </SubmitButton>
      </div>
    </form>
  );
}
