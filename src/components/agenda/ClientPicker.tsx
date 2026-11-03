"use client";

import { useMemo, useState } from "react";

export type ClientOption = { id: string; name: string; tradeName: string };

const primaryButtonClass =
  "bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200";
const secondaryButtonClass =
  "border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";
const linkButtonClass = "text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400";
const inputClass =
  "w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
const labelClass = "mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300";

// Escolha de cliente da Agenda (busca + criacao rapida, POST /api/clientes) -
// extraida do formulario com horario (Agenda A3) para o formulario por dia
// usar exatamente o mesmo comportamento.
export function ClientPicker({
  clients,
  clientId,
  onChange,
  onError,
}: {
  clients: ClientOption[];
  clientId: string;
  onChange: (id: string) => void;
  onError: (message: string | null) => void;
}) {
  const [localClients, setLocalClients] = useState(clients);
  const [clientSearch, setClientSearch] = useState("");
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [savingClient, setSavingClient] = useState(false);

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return localClients;
    const term = clientSearch.trim().toLowerCase();
    return localClients.filter((c) => c.name.toLowerCase().includes(term) || c.tradeName.toLowerCase().includes(term));
  }, [localClients, clientSearch]);

  async function createClientInline() {
    if (!newClientName.trim()) return;
    setSavingClient(true);
    onError(null);
    try {
      const res = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newClientName }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(result.error ?? "Não foi possível criar o cliente.");
        return;
      }
      const created = { id: result.id, name: newClientName, tradeName: "" };
      setLocalClients((prev) => [...prev, created]);
      onChange(created.id);
      setNewClientName("");
      setShowCreateClient(false);
      setClientSearch("");
    } catch {
      onError("Erro de conexão. Tente novamente.");
    } finally {
      setSavingClient(false);
    }
  }

  return (
    <section className="border border-gray-200 p-6 dark:border-neutral-800">
      <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-neutral-100">Cliente</h2>

      {!clientId ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="clientSearch" className={labelClass}>
            Buscar cliente
          </label>
          <input
            id="clientSearch"
            type="text"
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
            placeholder="Digite o nome..."
            className={inputClass}
          />
          {filteredClients.length > 0 && (
            <ul className="flex max-h-48 flex-col overflow-y-auto border border-gray-200 dark:border-neutral-800">
              {filteredClients.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onChange(c.id)}
                    className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  >
                    {c.name}
                    {c.tradeName ? ` (${c.tradeName})` : ""}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!showCreateClient ? (
            <button type="button" onClick={() => setShowCreateClient(true)} className={`${linkButtonClass} self-start`}>
              + Criar novo cliente
            </button>
          ) : (
            <div className="flex flex-col gap-2 border border-gray-200 p-3 dark:border-neutral-800">
              <label htmlFor="newClientName" className={labelClass}>
                Nome do novo cliente
              </label>
              <input
                id="newClientName"
                type="text"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                className={inputClass}
              />
              <div className="flex gap-2">
                <button type="button" onClick={createClientInline} disabled={savingClient} className={primaryButtonClass}>
                  {savingClient ? "Salvando..." : "Criar cliente"}
                </button>
                <button type="button" onClick={() => setShowCreateClient(false)} className={secondaryButtonClass}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-900 dark:text-neutral-100">{localClients.find((c) => c.id === clientId)?.name}</p>
          <button type="button" onClick={() => onChange("")} className={linkButtonClass}>
            Trocar
          </button>
        </div>
      )}
    </section>
  );
}
