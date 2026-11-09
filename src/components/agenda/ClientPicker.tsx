"use client";

import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { focusNextFieldAfter, isImeComposing } from "@/lib/forms/enterNavigation";

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
//
// A busca e um combobox acessivel (role="combobox" + listbox/option): ao
// digitar, o primeiro resultado fica destacado; Setas mudam o destaque; Enter
// seleciona o destacado e leva o foco ao proximo campo do formulario; Esc fecha
// a lista; sem resultado (ou sem destaque), Enter nao faz nada. O Enter da
// busca NUNCA envia o formulario da pagina. "Criar novo cliente" e um
// mini-formulario (data-enter-group): Enter no ultimo campo cria o cliente.
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
  const [listOpen, setListOpen] = useState(true);
  // -1: nada destacado (campo vazio, ainda sem digitar nem usar as setas).
  const [activeIndex, setActiveIndex] = useState(-1);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [savingClient, setSavingClient] = useState(false);

  const sectionRef = useRef<HTMLElement>(null);
  // Depois de escolher (Enter) ou criar um cliente, o foco vai para o proximo
  // campo do formulario - so depois do render que troca a busca pelo cliente.
  const moveFocusAfterPick = useRef(false);
  const listboxId = useId();
  const optionId = (id: string) => `${listboxId}-option-${id}`;

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return localClients;
    const term = clientSearch.trim().toLowerCase();
    return localClients.filter((c) => c.name.toLowerCase().includes(term) || c.tradeName.toLowerCase().includes(term));
  }, [localClients, clientSearch]);

  const showList = listOpen && filteredClients.length > 0;
  const activeClient = showList && activeIndex >= 0 ? filteredClients[activeIndex] : undefined;

  useEffect(() => {
    if (clientId && moveFocusAfterPick.current) {
      moveFocusAfterPick.current = false;
      if (sectionRef.current) focusNextFieldAfter(sectionRef.current);
    }
  }, [clientId]);

  useEffect(() => {
    if (!activeClient) return;
    document.getElementById(optionId(activeClient.id))?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- so quando o destaque muda
  }, [activeClient?.id]);

  function pick(id: string, moveFocus: boolean) {
    moveFocusAfterPick.current = moveFocus;
    setActiveIndex(-1);
    onChange(id);
  }

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>) {
    const text = event.target.value;
    setClientSearch(text);
    setListOpen(true);
    setActiveIndex(text.trim() ? 0 : -1);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (isImeComposing(event.nativeEvent)) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (filteredClients.length === 0) return;
      event.preventDefault();
      const last = filteredClients.length - 1;
      if (!listOpen) {
        setListOpen(true);
        setActiveIndex(event.key === "ArrowDown" ? 0 : last);
        return;
      }
      setActiveIndex((current) => {
        if (event.key === "ArrowDown") return current >= last ? 0 : current + 1;
        return current <= 0 ? last : current - 1;
      });
    } else if (event.key === "Escape") {
      if (!showList) return;
      event.preventDefault();
      event.stopPropagation();
      setListOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Enter") {
      // O Enter da busca e sempre tratado aqui (preventDefault): nunca envia o
      // formulario e, sem resultado destacado, nao faz nada.
      event.preventDefault();
      if (activeClient) pick(activeClient.id, true);
    }
  }

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
      pick(created.id, true);
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
    <section ref={sectionRef} className="border border-gray-200 p-6 dark:border-neutral-800">
      <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-neutral-100">Cliente</h2>

      {!clientId ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="clientSearch" className={labelClass}>
            Buscar cliente
          </label>
          <input
            id="clientSearch"
            type="text"
            role="combobox"
            aria-expanded={showList}
            aria-controls={showList ? listboxId : undefined}
            aria-activedescendant={activeClient ? optionId(activeClient.id) : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            value={clientSearch}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            placeholder="Digite o nome..."
            className={inputClass}
          />
          {showList && (
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Clientes encontrados"
              className="flex max-h-48 flex-col overflow-y-auto border border-gray-200 dark:border-neutral-800"
            >
              {filteredClients.map((c, index) => (
                <li
                  key={c.id}
                  id={optionId(c.id)}
                  role="option"
                  aria-selected={index === activeIndex}
                  // Mouse: escolhe sem tirar o foco da busca antes da hora.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(c.id, false)}
                  className={`block w-full cursor-pointer px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-neutral-300 dark:hover:bg-neutral-800 ${
                    index === activeIndex ? "bg-gray-100 dark:bg-neutral-800" : ""
                  }`}
                >
                  {c.name}
                  {c.tradeName ? ` (${c.tradeName})` : ""}
                </li>
              ))}
            </ul>
          )}

          {!showCreateClient ? (
            <button type="button" onClick={() => setShowCreateClient(true)} className={`${linkButtonClass} self-start`}>
              + Criar novo cliente
            </button>
          ) : (
            <div data-enter-group="" className="flex flex-col gap-2 border border-gray-200 p-3 dark:border-neutral-800">
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
                <button type="button" data-enter-confirm="" onClick={createClientInline} disabled={savingClient} className={primaryButtonClass}>
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
