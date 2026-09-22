"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { computeEndAt } from "@/lib/agenda/calculations";
import { formatTokyoTime } from "@/lib/agenda/time";

const primaryButtonClass =
  "bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200";
const secondaryButtonClass =
  "border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";
const linkButtonClass = "text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400";
const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
const labelClass = "mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300";

export type ClientOption = { id: string; name: string; tradeName: string };
export type ServiceOption = { id: string; name: string; durationMinutes: number; defaultPrice: string };
type ConflictAppointment = { id: string; startAt: string; endAt: string };

export function AppointmentForm({
  mode,
  appointmentId,
  clients,
  services,
  initialClientId,
  initialServiceIds,
  initialStartAt,
  initialNotes,
}: {
  mode: "create" | "edit";
  appointmentId?: string;
  clients: ClientOption[];
  services: ServiceOption[];
  initialClientId?: string;
  initialServiceIds?: string[];
  // "YYYY-MM-DDTHH:mm" já no fuso de Tóquio (ver formatTokyoDateKey +
  // formatTokyoTime na página que monta esse valor) - nunca calculado com
  // fuso local do navegador.
  initialStartAt?: string;
  initialNotes?: string;
}) {
  const router = useRouter();

  const [localClients, setLocalClients] = useState(clients);
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [clientSearch, setClientSearch] = useState("");
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [savingClient, setSavingClient] = useState(false);

  const [localServices, setLocalServices] = useState(services);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(initialServiceIds ?? []);
  const [addServiceId, setAddServiceId] = useState("");
  const [showCreateService, setShowCreateService] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDuration, setNewServiceDuration] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [savingService, setSavingService] = useState(false);

  const [startAtInput, setStartAtInput] = useState(initialStartAt ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");

  const [conflicts, setConflicts] = useState<ConflictAppointment[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return localClients;
    const term = clientSearch.trim().toLowerCase();
    return localClients.filter((c) => c.name.toLowerCase().includes(term) || c.tradeName.toLowerCase().includes(term));
  }, [localClients, clientSearch]);

  const selectedServices = selectedServiceIds
    .map((id) => localServices.find((s) => s.id === id))
    .filter((s): s is ServiceOption => Boolean(s));

  const availableServicesToAdd = localServices.filter((s) => !selectedServiceIds.includes(s.id));

  const endAtPreview = useMemo(() => {
    if (!startAtInput || selectedServices.length === 0) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(startAtInput);
    if (!match) return null;
    // Preview local ao componente - so pra mostrar o horario de fim
    // calculado, nao usado pra persistir nada (o backend recalcula do zero
    // via parseTokyoDateTimeInput + computeEndAt).
    const [, year, month, day, hour, minute] = match;
    const startAtUtcGuess = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)) - 9 * 60 * 60 * 1000);
    const endAt = computeEndAt(
      startAtUtcGuess,
      selectedServices.map((s) => ({ durationMinutesSnapshot: s.durationMinutes }))
    );
    return formatTokyoTime(endAt);
  }, [startAtInput, selectedServices]);

  async function createClientInline() {
    if (!newClientName.trim()) return;
    setSavingClient(true);
    setError(null);
    try {
      const res = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newClientName }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(result.error ?? "Não foi possível criar o cliente.");
        return;
      }
      const created = { id: result.id, name: newClientName, tradeName: "" };
      setLocalClients((prev) => [...prev, created]);
      setClientId(created.id);
      setNewClientName("");
      setShowCreateClient(false);
      setClientSearch("");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSavingClient(false);
    }
  }

  async function createServiceInline() {
    if (!newServiceName.trim() || !newServiceDuration) return;
    setSavingService(true);
    setError(null);
    try {
      const res = await fetch("/api/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newServiceName,
          type: "SERVICO",
          durationMinutes: newServiceDuration,
          defaultPrice: newServicePrice || undefined,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(result.error ?? "Não foi possível criar o serviço.");
        return;
      }
      const created = { id: result.id, name: newServiceName, durationMinutes: Number(newServiceDuration), defaultPrice: newServicePrice || "" };
      setLocalServices((prev) => [...prev, created]);
      setSelectedServiceIds((prev) => [...prev, created.id]);
      setNewServiceName("");
      setNewServiceDuration("");
      setNewServicePrice("");
      setShowCreateService(false);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSavingService(false);
    }
  }

  function addService(id: string) {
    if (!id || selectedServiceIds.includes(id)) return;
    setSelectedServiceIds((prev) => [...prev, id]);
    setAddServiceId("");
  }

  function removeService(id: string) {
    setSelectedServiceIds((prev) => prev.filter((s) => s !== id));
  }

  async function submit(allowOverlap: boolean) {
    setError(null);
    if (!clientId) return setError("Selecione um cliente.");
    if (selectedServiceIds.length === 0) return setError("Adicione ao menos um serviço.");
    if (!startAtInput) return setError("Informe a data/hora de início.");

    setPending(true);
    try {
      const payload = {
        clientId,
        startAt: startAtInput,
        services: selectedServiceIds.map((id) => ({ productId: id })),
        notes: notes || undefined,
        allowOverlap,
      };
      const url = mode === "create" ? "/api/agenda" : `/api/agenda/${appointmentId}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (result.conflicts) {
          setConflicts(result.conflicts);
          return;
        }
        setError(result.error ?? "Não foi possível salvar o agendamento.");
        return;
      }

      setConflicts(null);
      router.push("/agenda");
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-6" noValidate>
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
                      onClick={() => setClientId(c.id)}
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
            <button type="button" onClick={() => setClientId("")} className={linkButtonClass}>
              Trocar
            </button>
          </div>
        )}
      </section>

      <section className="border border-gray-200 p-6 dark:border-neutral-800">
        <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-neutral-100">Serviços</h2>

        {selectedServices.length > 0 && (
          <ul className="mb-3 flex flex-col gap-2">
            {selectedServices.map((service) => (
              <li key={service.id} className="flex items-center justify-between gap-3 border border-gray-200 px-3 py-2 text-sm dark:border-neutral-800">
                <span className="text-gray-700 dark:text-neutral-300">
                  {service.name} ({service.durationMinutes} min)
                </span>
                <button type="button" onClick={() => removeService(service.id)} className={linkButtonClass}>
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}

        {availableServicesToAdd.length > 0 && (
          <div className="flex gap-2">
            <select value={addServiceId} onChange={(e) => addService(e.target.value)} className={inputClass}>
              <option value="">Adicionar serviço...</option>
              {availableServicesToAdd.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.durationMinutes} min)
                </option>
              ))}
            </select>
          </div>
        )}

        {localServices.length === 0 && selectedServices.length === 0 && (
          <p className="mb-3 text-sm text-gray-500 dark:text-neutral-400">Nenhum serviço cadastrado ainda.</p>
        )}

        {!showCreateService ? (
          <button type="button" onClick={() => setShowCreateService(true)} className={`${linkButtonClass} mt-2`}>
            + Criar novo serviço
          </button>
        ) : (
          <div className="mt-2 flex flex-col gap-2 border border-gray-200 p-3 dark:border-neutral-800">
            <div>
              <label htmlFor="newServiceName" className={labelClass}>
                Nome do serviço
              </label>
              <input id="newServiceName" type="text" value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="newServiceDuration" className={labelClass}>
                  Duração (min)
                </label>
                <input
                  id="newServiceDuration"
                  type="number"
                  min={1}
                  max={720}
                  value={newServiceDuration}
                  onChange={(e) => setNewServiceDuration(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="newServicePrice" className={labelClass}>
                  Preço (opcional)
                </label>
                <input
                  id="newServicePrice"
                  type="number"
                  min={0}
                  value={newServicePrice}
                  onChange={(e) => setNewServicePrice(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-neutral-400">Preço com imposto incluído (総額表示).</p>
            <div className="flex gap-2">
              <button type="button" onClick={createServiceInline} disabled={savingService} className={primaryButtonClass}>
                {savingService ? "Salvando..." : "Criar serviço"}
              </button>
              <button type="button" onClick={() => setShowCreateService(false)} className={secondaryButtonClass}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="border border-gray-200 p-6 dark:border-neutral-800">
        <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-neutral-100">Data e hora</h2>
        <div>
          <label htmlFor="startAt" className={labelClass}>
            Início (horário de Tóquio)
          </label>
          <input
            id="startAt"
            type="datetime-local"
            value={startAtInput}
            onChange={(e) => setStartAtInput(e.target.value)}
            className={inputClass}
          />
        </div>
        {endAtPreview && <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">Fim previsto: {endAtPreview}</p>}
      </section>

      <section className="border border-gray-200 p-6 dark:border-neutral-800">
        <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-neutral-100">Observação (opcional)</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={3}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">Não registre informações de saúde ou dados sensíveis do cliente.</p>
      </section>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {conflicts && (
        <div className="border border-gray-300 p-4 text-sm dark:border-neutral-700">
          <p className="text-gray-700 dark:text-neutral-300">
            Este horário conflita com {conflicts.length} outro{conflicts.length > 1 ? "s" : ""} agendamento{conflicts.length > 1 ? "s" : ""}.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setConflicts(null)} className={secondaryButtonClass}>
              Ajustar horário
            </button>
            <button type="button" onClick={() => submit(true)} disabled={pending} className={primaryButtonClass}>
              Agendar mesmo assim
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button type="button" onClick={() => submit(false)} disabled={pending} className={primaryButtonClass}>
          {pending ? "Salvando..." : mode === "create" ? "Agendar" : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}
