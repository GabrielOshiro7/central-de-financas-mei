"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AppointmentStatus, SaleStatus } from "@prisma/client";
import { CircleCheck, Pencil, RotateCcw } from "lucide-react";
import { ConfirmDialog } from "@/components/financeiro/ConfirmDialog";
import { UndoCompletionAction } from "@/components/agenda/UndoCompletionAction";

// Botoes com cantos retos (mesmo padrao de AppointmentActions).
const straightButtonBase = "inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
const primaryButtonClass = `${straightButtonBase} bg-gray-900 text-white hover:bg-gray-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200`;
const secondaryButtonClass = `${straightButtonBase} border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800`;
const dangerButtonClass = `${straightButtonBase} border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20`;

type Pending = "complete" | "CANCELADO" | "FALTOU" | "AGENDADO";

// Acoes do fluxo POR DIA (DAY, Agenda A3), as mesmas nas tres abas:
// - AGENDADO: Editar; Concluir agora e Faltou so a partir do dia do
//   atendimento (no fuso da empresa); Cancelar.
// - CANCELADO/FALTOU: Reabrir (o reaberto nunca mais e concluido
//   automaticamente - decisao 7).
// - CONCLUIDO: o link da venda e Desfazer (Agenda A4).
// Sem "Confirmar": CONFIRMADO nao existe no fluxo DAY.
export function DayAppointmentActions({
  appointmentId,
  status,
  dayKey,
  todayKey,
  saleId,
  saleNumber,
  saleStatus,
  receivedLabel,
}: {
  appointmentId: string;
  status: AppointmentStatus;
  dayKey: string;
  // "Hoje" da EMPRESA (DateKey, do servidor).
  todayKey: string;
  saleId: string | null;
  saleNumber: number | null;
  saleStatus: SaleStatus | null;
  // Valor ja recebido da venda, formatado (aviso do Desfazer).
  receivedLabel: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<Pending | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dayReached = dayKey <= todayKey;

  async function run(action: Pending) {
    setPending(action);
    setError(null);
    try {
      const res =
        action === "complete"
          ? await fetch(`/api/agenda/${appointmentId}/complete`, { method: "POST" })
          : await fetch(`/api/agenda/${appointmentId}/status`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: action }),
            });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(result.error ?? "Não foi possível atualizar o agendamento.");
        return;
      }
      setConfirming(null);
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setPending(null);
    }
  }

  if (status === "CONCLUIDO") {
    return (
      <div className="flex flex-col gap-2 text-sm">
        {saleId ? (
          <Link href={`/vendas/${saleId}`} className="text-gray-600 hover:underline dark:text-neutral-400">
            Ver venda{saleNumber ? ` #${saleNumber}` : ""}
            {saleStatus === "CANCELLED" ? " (venda cancelada)" : ""}
          </Link>
        ) : (
          <span className="text-gray-500 dark:text-neutral-400">Concluído sem venda (valor zero).</span>
        )}
        <UndoCompletionAction
          appointmentId={appointmentId}
          saleNumber={saleNumber}
          saleActive={Boolean(saleId) && saleStatus !== "CANCELLED"}
          receivedLabel={receivedLabel}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "AGENDADO" && (
          <>
            <Link href={`/agenda/${appointmentId}/editar`} className={secondaryButtonClass}>
              <Pencil size={13} aria-hidden="true" />
              Editar
            </Link>
            {dayReached && (
              <button type="button" onClick={() => setConfirming("complete")} disabled={pending !== null} className={primaryButtonClass}>
                <CircleCheck size={13} aria-hidden="true" />
                Concluir agora
              </button>
            )}
            {dayReached && (
              <button type="button" onClick={() => setConfirming("FALTOU")} disabled={pending !== null} className={secondaryButtonClass}>
                Faltou
              </button>
            )}
            <button type="button" onClick={() => setConfirming("CANCELADO")} disabled={pending !== null} className={dangerButtonClass}>
              Cancelar
            </button>
          </>
        )}

        {(status === "CANCELADO" || status === "FALTOU") && (
          <button type="button" onClick={() => setConfirming("AGENDADO")} disabled={pending !== null} className={secondaryButtonClass}>
            <RotateCcw size={13} aria-hidden="true" />
            Reabrir
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={confirming === "complete"}
        title="Concluir atendimento"
        message="O atendimento será concluído agora e a venda será registrada no dia do atendimento, com os serviços, valores e pagamento deste agendamento."
        confirmLabel="Concluir agora"
        pendingLabel="Concluindo..."
        pending={pending === "complete"}
        onConfirm={() => run("complete")}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming === "CANCELADO"}
        title="Cancelar agendamento"
        message="Tem certeza que deseja cancelar este agendamento? Ele poderá ser reaberto depois, mas não será mais concluído automaticamente."
        confirmLabel="Cancelar agendamento"
        pendingLabel="Cancelando..."
        pending={pending === "CANCELADO"}
        onConfirm={() => run("CANCELADO")}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming === "FALTOU"}
        title="Marcar falta"
        message="Tem certeza que deseja marcar este agendamento como falta? Ele poderá ser reaberto depois, mas não será mais concluído automaticamente."
        confirmLabel="Marcar falta"
        pendingLabel="Salvando..."
        pending={pending === "FALTOU"}
        onConfirm={() => run("FALTOU")}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming === "AGENDADO"}
        title="Reabrir agendamento"
        message="O agendamento volta para Agendado, mas NÃO será concluído automaticamente: quando o atendimento acontecer, conclua-o com “Concluir agora”."
        confirmLabel="Reabrir"
        pendingLabel="Reabrindo..."
        pending={pending === "AGENDADO"}
        onConfirm={() => run("AGENDADO")}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
