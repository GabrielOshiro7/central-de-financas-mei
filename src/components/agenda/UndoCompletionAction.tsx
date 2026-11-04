"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { ConfirmDialog } from "@/components/financeiro/ConfirmDialog";
import type { UndoTarget } from "@/lib/agenda/schema";

// Botao com cantos retos (mesmo padrao de DayAppointmentActions).
const secondaryButtonClass =
  "inline-flex items-center gap-1 border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";

const TARGET_OPTIONS: { value: UndoTarget; label: string; hint: string }[] = [
  { value: "AGENDADO", label: "Concluí por engano", hint: "Volta para Agendado." },
  { value: "FALTOU", label: "O cliente não veio", hint: "Fica como Faltou." },
  { value: "CANCELADO", label: "O atendimento foi cancelado", hint: "Fica como Cancelado." },
];

// Desfazer a conclusao (Agenda A4), nos dois fluxos e nas tres abas. O
// dialogo pede o destino e avisa o que acontece com o dinheiro: a venda
// ativa e cancelada e o que ja foi recebido sai do Caixa e do Dashboard.
export function UndoCompletionAction({
  appointmentId,
  saleNumber,
  saleActive,
  receivedLabel,
  onUndone,
}: {
  appointmentId: string;
  saleNumber: number | null;
  // Ha venda vinculada e ela nao esta cancelada.
  saleActive: boolean;
  // Valor ja recebido da venda, formatado (null quando nada foi recebido).
  receivedLabel: string | null;
  // Chamado depois de desfazer, antes do router.refresh() (ex.: TIMED limpa o
  // estado local de "recem-concluido").
  onUndone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<UndoTarget>("AGENDADO");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function undo() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/agenda/${appointmentId}/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(result.error ?? "Não foi possível desfazer a conclusão.");
        setOpen(false);
        return;
      }
      setOpen(false);
      onUndone?.();
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  const saleText = saleActive ? ` A venda${saleNumber ? ` #${saleNumber}` : ""} será cancelada.` : "";

  return (
    <div className="flex flex-col gap-2">
      <div>
        <button type="button" onClick={() => setOpen(true)} disabled={pending} className={secondaryButtonClass}>
          <Undo2 size={13} aria-hidden="true" />
          Desfazer
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={open}
        title="Desfazer conclusão"
        message={`O atendimento deixa de estar concluído e não será mais concluído automaticamente.${saleText}`}
        confirmLabel="Desfazer conclusão"
        pendingLabel="Desfazendo..."
        pending={pending}
        onConfirm={undo}
        onCancel={() => setOpen(false)}
      >
        <fieldset className="mt-4 flex flex-col gap-2">
          <legend className="mb-1 text-xs font-semibold text-gray-700 dark:text-neutral-300">O que aconteceu?</legend>
          {TARGET_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-start gap-2 text-sm text-gray-700 dark:text-neutral-300">
              <input
                type="radio"
                name={`undo-target-${appointmentId}`}
                value={option.value}
                checked={to === option.value}
                onChange={() => setTo(option.value)}
                className="mt-0.5"
              />
              <span>
                {option.label}
                <span className="block text-xs text-gray-500 dark:text-neutral-400">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {saleActive && receivedLabel && (
          <p className="mt-4 text-sm text-gray-700 dark:text-neutral-300" data-testid="undo-received-amount">
            O recebimento de <span className="font-semibold">{receivedLabel}</span> será estornado: o valor sai do Caixa e do Dashboard.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
