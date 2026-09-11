"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClientType } from "@prisma/client";
import { ConfirmDialog } from "@/components/financeiro/ConfirmDialog";
import { ClientFormModal, type ClientFormInitial } from "@/components/clientes/ClientFormModal";
import { CLIENT_TYPE_LABELS } from "@/lib/clients/options";

export type ClientRow = {
  id: string;
  name: string;
  tradeName: string;
  clientType: ClientType;
  document: string;
  phone: string;
  whatsapp: string;
  email: string;
  addressLine: string;
  city: string;
  state: string;
  country: string;
  notes: string;
  active: boolean;
  salesCount: number;
  lastPurchaseDisplay: string | null;
};

export function ClientTable({ rows }: { rows: ClientRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [togglingActive, setTogglingActive] = useState<ClientRow | null>(null);
  const [togglePending, setTogglePending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleConfirmToggle() {
    if (!togglingActive) return;
    setTogglePending(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/clientes/${togglingActive.id}/active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !togglingActive.active }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(result.error ?? "Não foi possível atualizar o status.");
        return;
      }
      setTogglingActive(null);
      router.refresh();
    } catch {
      setActionError("Erro de conexão. Tente novamente.");
    } finally {
      setTogglePending(false);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
        <p>Nenhum cliente encontrado para os filtros selecionados.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-neutral-800 dark:text-neutral-400">
            <th className="px-4 py-3 font-medium">Cliente</th>
            <th className="px-4 py-3 font-medium">Contato</th>
            <th className="px-4 py-3 text-right font-medium">Total de vendas</th>
            <th className="px-4 py-3 font-medium">Última venda</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-100 last:border-0 dark:border-neutral-800">
              <td className="px-4 py-3 text-gray-900 dark:text-neutral-100">
                <div className="font-medium">{row.name}</div>
                <div className="text-xs text-gray-500 dark:text-neutral-400">
                  {row.tradeName || CLIENT_TYPE_LABELS[row.clientType]}
                </div>
              </td>
              <td className="px-4 py-3 text-gray-700 dark:text-neutral-300">
                {row.phone || row.whatsapp || row.email || "-"}
              </td>
              <td className="px-4 py-3 text-right text-gray-900 dark:text-neutral-100">{row.salesCount}</td>
              <td className="px-4 py-3 text-gray-700 dark:text-neutral-300">{row.lastPurchaseDisplay ?? "-"}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    row.active
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}
                >
                  {row.active ? "Ativo" : "Inativo"}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/clientes/${row.id}`}
                    className="text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400"
                  >
                    Ver
                  </Link>
                  <button
                    type="button"
                    onClick={() => setEditing(row)}
                    className="text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTogglingActive(row);
                      setActionError(null);
                    }}
                    className={`text-sm font-medium hover:underline ${
                      row.active ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {row.active ? "Inativar" : "Reativar"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {actionError && (
        <p role="alert" className="px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {actionError}
        </p>
      )}

      {editing && (
        <ClientFormModal
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          initial={
            {
              id: editing.id,
              name: editing.name,
              tradeName: editing.tradeName,
              clientType: editing.clientType,
              document: editing.document,
              phone: editing.phone,
              whatsapp: editing.whatsapp,
              email: editing.email,
              addressLine: editing.addressLine,
              city: editing.city,
              state: editing.state,
              country: editing.country,
              notes: editing.notes,
            } satisfies ClientFormInitial
          }
        />
      )}

      <ConfirmDialog
        open={Boolean(togglingActive)}
        title={togglingActive?.active ? "Inativar cliente" : "Reativar cliente"}
        message={
          togglingActive?.active
            ? "O cliente deixa de aparecer como opção para novas vendas, mas seu histórico continua disponível."
            : "O cliente volta a aparecer como opção para novas vendas."
        }
        confirmLabel={togglingActive?.active ? "Inativar" : "Reativar"}
        pendingLabel={togglingActive?.active ? "Inativando..." : "Reativando..."}
        pending={togglePending}
        onConfirm={handleConfirmToggle}
        onCancel={() => setTogglingActive(null)}
      />
    </div>
  );
}
