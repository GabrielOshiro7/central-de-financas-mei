"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AppointmentStatus, Currency, SaleStatus } from "@prisma/client";
import { ConfirmDialog } from "@/components/financeiro/ConfirmDialog";
import { CompleteAppointmentDialog, type CompleteDialogItem } from "@/components/agenda/CompleteAppointmentDialog";

// Botoes com cantos retos (regra de design da Etapa 8).
const straightButtonBase = "px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
const primaryButtonClass = `${straightButtonBase} bg-gray-900 text-white hover:bg-gray-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200`;
const secondaryButtonClass = `${straightButtonBase} border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800`;
const dangerButtonClass = `${straightButtonBase} border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20`;

type ConflictAppointment = { id: string; startAt: string; endAt: string };

export function AppointmentActions({
  appointmentId,
  status,
  saleId,
  saleNumber,
  saleStatus,
  currency,
  revenueCategories,
  defaultCategoryId,
  completeItems,
  nextAppointmentHref,
  todayKey,
}: {
  appointmentId: string;
  status: AppointmentStatus;
  saleId: string | null;
  saleNumber: number | null;
  saleStatus: SaleStatus | null;
  currency: Currency;
  revenueCategories: { id: string; name: string }[];
  defaultCategoryId: string | null;
  completeItems: CompleteDialogItem[];
  // Link pronto pra "agendar o proximo" (mesmo cliente/servicos) - construido
  // pelo chamador a partir dos dados que ja tem, ver AppointmentList.tsx.
  nextAppointmentHref: string;
  // "Hoje" da empresa (DateKey, do servidor) para o dialogo de conclusao (F4).
  todayKey: string;
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"CANCELADO" | "FALTOU" | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completedResult, setCompletedResult] = useState<{ saleId: string; saleNumber: number } | null>(null);
  const [conflicts, setConflicts] = useState<ConflictAppointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changeStatus(to: AppointmentStatus, allowOverlap = false) {
    setPendingAction(to);
    setError(null);
    try {
      const res = await fetch(`/api/agenda/${appointmentId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to, allowOverlap }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (result.conflicts) {
          setConflicts(result.conflicts);
        } else {
          setError(result.error ?? "Não foi possível atualizar o agendamento.");
        }
        return;
      }
      setConflicts(null);
      setConfirming(null);
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setPendingAction(null);
    }
  }

  if (completedResult) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-gray-700 dark:text-neutral-300">
          Atendimento concluído -{" "}
          <Link href={`/vendas/${completedResult.saleId}`} className="font-medium text-gray-900 hover:underline dark:text-neutral-100">
            ver venda #{completedResult.saleNumber}
          </Link>
        </span>
        <Link href={nextAppointmentHref} className={secondaryButtonClass}>
          Agendar o próximo
        </Link>
      </div>
    );
  }

  if (status === "CONCLUIDO") {
    return (
      <div className="text-sm">
        {saleId ? (
          <Link href={`/vendas/${saleId}`} className="text-gray-600 hover:underline dark:text-neutral-400">
            Ver venda{saleNumber ? ` #${saleNumber}` : ""}
            {saleStatus === "CANCELLED" ? " (venda cancelada)" : ""}
          </Link>
        ) : (
          <span className="text-gray-500 dark:text-neutral-400">Sem venda vinculada.</span>
        )}
        {saleStatus === "CANCELLED" && (
          <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
            A venda foi cancelada, mas o atendimento continua concluído - não é possível desfazer a conclusão de um agendamento com pagamento já
            registrado anteriormente.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "AGENDADO" && (
          <button type="button" onClick={() => changeStatus("CONFIRMADO")} disabled={pendingAction !== null} className={secondaryButtonClass}>
            {pendingAction === "CONFIRMADO" ? "Confirmando..." : "Confirmar"}
          </button>
        )}

        {(status === "AGENDADO" || status === "CONFIRMADO") && (
          <>
            <button type="button" onClick={() => setCompleting(true)} disabled={pendingAction !== null} className={primaryButtonClass}>
              Concluir
            </button>
            <button
              type="button"
              onClick={() => setConfirming("FALTOU")}
              disabled={pendingAction !== null}
              className={secondaryButtonClass}
            >
              Faltou
            </button>
            <button
              type="button"
              onClick={() => setConfirming("CANCELADO")}
              disabled={pendingAction !== null}
              className={dangerButtonClass}
            >
              Cancelar
            </button>
          </>
        )}

        {(status === "CANCELADO" || status === "FALTOU") && (
          <button type="button" onClick={() => changeStatus("AGENDADO")} disabled={pendingAction !== null} className={secondaryButtonClass}>
            {pendingAction === "AGENDADO" ? "Reabrindo..." : "Reabrir"}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {conflicts && (
        <div className="border border-gray-300 p-3 text-sm dark:border-neutral-700">
          <p className="text-gray-700 dark:text-neutral-300">
            Este horário conflita com {conflicts.length} outro{conflicts.length > 1 ? "s" : ""} agendamento
            {conflicts.length > 1 ? "s" : ""}.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setConflicts(null)} className={secondaryButtonClass}>
              Cancelar
            </button>
            <button type="button" onClick={() => changeStatus("AGENDADO", true)} className={primaryButtonClass}>
              Reabrir mesmo assim
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming === "CANCELADO"}
        title="Cancelar agendamento"
        message="Tem certeza que deseja cancelar este agendamento? Essa ação pode ser desfeita depois, reabrindo o agendamento."
        confirmLabel="Cancelar agendamento"
        pendingLabel="Cancelando..."
        pending={pendingAction === "CANCELADO"}
        onConfirm={() => changeStatus("CANCELADO")}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming === "FALTOU"}
        title="Marcar falta"
        message="Tem certeza que deseja marcar este agendamento como falta?"
        confirmLabel="Marcar falta"
        pendingLabel="Salvando..."
        pending={pendingAction === "FALTOU"}
        onConfirm={() => changeStatus("FALTOU")}
        onCancel={() => setConfirming(null)}
      />

      {completing && (
        <CompleteAppointmentDialog
          appointmentId={appointmentId}
          currency={currency}
          revenueCategories={revenueCategories}
          defaultCategoryId={defaultCategoryId}
          initialItems={completeItems}
          todayKey={todayKey}
          onClose={() => setCompleting(false)}
          onCompleted={(result) => {
            setCompleting(false);
            setCompletedResult(result);
          }}
        />
      )}
    </div>
  );
}
