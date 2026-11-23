"use client";

import { useId, type ReactNode } from "react";
import { useDialogFocus } from "@/components/useDialogFocus";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  pendingLabel = "Excluindo...",
  pending,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  // Texto do botao de voltar (padrao "Cancelar").
  cancelLabel?: string;
  // Default preservado para nao alterar o texto ja exibido pelos dialogs
  // existentes (revert/cancel de Bill) - so sobrescrito por chamadores cuja
  // acao nao e uma exclusao (ex.: inativar cliente, cancelar venda).
  pendingLabel?: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  // Conteudo extra entre a mensagem e os botoes (ex.: escolha do destino ao
  // desfazer um atendimento, Agenda A4). Os dialogos existentes nao passam.
  children?: ReactNode;
}) {
  // Foco do dialogo (WCAG 2.1.2 / 2.4.3): entra ao abrir, Tab preso, Esc fecha, volta ao botao de origem.
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useDialogFocus<HTMLDivElement>(open, pending ? undefined : onCancel);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(event) => {
        // So o clique NO fundo cancela (um clique que sobe de um filho/portal nao).
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={messageId}
        aria-modal="true"
        className="w-full max-w-sm bg-white p-6 shadow-lg dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
          {title}
        </h2>
        <p id={messageId} className="mt-2 text-sm text-gray-600 dark:text-neutral-400">
          {message}
        </p>
        {children}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
