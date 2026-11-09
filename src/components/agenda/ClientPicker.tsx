"use client";

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { ClientFormModal, type SavedClient } from "@/components/clientes/ClientFormModal";
import { focusNextFieldAfter, isImeComposing } from "@/lib/forms/enterNavigation";

export type ClientOption = { id: string; name: string; tradeName: string };

const linkButtonClass = "text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400";
const inputClass =
  "w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
const labelClass = "mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300";

export const CLIENT_SEARCH_DEBOUNCE_MS = 250;

type Results = { query: string; items: ClientOption[] };

// Eventos do pop-up (portal) sobem pela arvore do React ate o <form> do
// agendamento: aqui eles sao barrados - o submit do pop-up nunca pode chegar
// ao formulario da pagina.
const stopBubbling = (event: SyntheticEvent) => event.stopPropagation();

// Escolha de cliente da Agenda.
//
// A busca e um combobox acessivel (role="combobox" + listbox/option): ao
// digitar, o primeiro resultado fica destacado; Setas mudam o destaque; Enter
// seleciona o destacado e leva o foco ao proximo campo do formulario; Esc fecha
// a lista; sem resultado (ou sem destaque), Enter nao faz nada. O Enter da
// busca NUNCA envia o formulario da pagina.
//
// A lista so aparece com o campo em foco: vazio, mostra os 3 clientes usados
// mais recentemente ("Recentes"); ao digitar, busca no servidor
// (GET /api/clientes/search, debounce, minimo 1 caractere, ate 8, ativos) -
// nenhuma lista completa de clientes vai ao navegador. "Criar novo cliente"
// abre o MESMO pop-up de cadastro da pagina Clientes (ClientFormModal), fora do
// formulario do agendamento (portal).
export function ClientPicker({
  clientId,
  initialClient,
  onChange,
  onError,
}: {
  clientId: string;
  // Cliente ja escolhido ao abrir a tela (edicao, "agendar o proximo").
  initialClient?: ClientOption | null;
  onChange: (id: string) => void;
  onError: (message: string | null) => void;
}) {
  const [selected, setSelected] = useState<ClientOption | null>(initialClient ?? null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  // Resultados da ULTIMA consulta concluida; so valem se forem do texto atual
  // (senao Enter poderia escolher um resultado de uma busca antiga).
  const [results, setResults] = useState<Results | null>(null);
  const [failed, setFailed] = useState(false);
  // -1: nada destacado (campo vazio, ainda sem digitar nem usar as setas).
  const [activeIndex, setActiveIndex] = useState(-1);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalName, setModalName] = useState("");

  const sectionRef = useRef<HTMLElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Depois de escolher (Enter) ou criar um cliente, o foco vai para o proximo
  // campo do formulario - so depois do render que troca a busca pelo cliente.
  const moveFocusAfterPick = useRef(false);
  const focusSearchAfterClear = useRef(false);
  const savedInModal = useRef(false);
  const listboxId = useId();
  const optionId = (id: string) => `${listboxId}-option-${id}`;

  const query = text.trim();
  const fresh = results !== null && results.query === query;
  const items = fresh ? results.items : [];
  const showList = open && fresh && items.length > 0;
  const showEmpty = open && fresh && items.length === 0;
  const showLoading = open && !fresh && !failed;
  const activeClient = showList && activeIndex >= 0 ? items[activeIndex] : undefined;

  const fetchClients = useCallback(async (term: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setFailed(false);
    try {
      const res = await fetch(`/api/clientes/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { clients: ClientOption[] };
      if (controller.signal.aborted) return;
      setResults({ query: term, items: data.clients });
      setActiveIndex(term ? 0 : -1);
    } catch {
      if (controller.signal.aborted) return;
      setResults(null);
      setFailed(true);
    }
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  useEffect(() => {
    if (clientId && moveFocusAfterPick.current) {
      moveFocusAfterPick.current = false;
      if (sectionRef.current) focusNextFieldAfter(sectionRef.current);
    }
    if (!clientId && focusSearchAfterClear.current) {
      focusSearchAfterClear.current = false;
      inputRef.current?.focus();
    }
  }, [clientId]);

  useEffect(() => {
    if (!activeClient) return;
    document.getElementById(optionId(activeClient.id))?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- so quando o destaque muda
  }, [activeClient?.id]);

  function pick(client: ClientOption, moveFocus: boolean) {
    moveFocusAfterPick.current = moveFocus;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    setSelected(client);
    setText("");
    setResults(null);
    setOpen(false);
    setActiveIndex(-1);
    onChange(client.id);
  }

  function clearSelection() {
    focusSearchAfterClear.current = true;
    setSelected(null);
    onChange("");
  }

  function handleFocus() {
    setOpen(true);
    // Foco com o campo vazio: os recentes (sempre frescos). Com texto, mantem
    // a ultima busca se ela for do texto atual.
    if (!fresh) void fetchClients(query);
    else if (!query) void fetchClients("");
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (wrapperRef.current?.contains(event.relatedTarget as Node | null)) return;
    setOpen(false);
  }

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    const term = value.trim();
    setText(value);
    setOpen(true);
    setActiveIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!term) {
      void fetchClients(""); // campo esvaziado: volta aos recentes, sem esperar
      return;
    }
    debounceRef.current = setTimeout(() => void fetchClients(term), CLIENT_SEARCH_DEBOUNCE_MS);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (isImeComposing(event.nativeEvent)) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!open) setOpen(true);
      if (items.length === 0) return;
      event.preventDefault();
      const last = items.length - 1;
      if (!open) {
        setActiveIndex(event.key === "ArrowDown" ? 0 : last);
        return;
      }
      setActiveIndex((current) => {
        if (event.key === "ArrowDown") return current >= last ? 0 : current + 1;
        return current <= 0 ? last : current - 1;
      });
    } else if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Enter") {
      // O Enter da busca e sempre tratado aqui (preventDefault): nunca envia o
      // formulario e, sem resultado destacado, nao faz nada.
      event.preventDefault();
      if (activeClient) pick(activeClient, true);
    }
  }

  // Pop-up de cadastro. Pre-preenche o Nome com o que foi digitado quando a
  // busca nao achou ninguem.
  function openCreateModal() {
    setModalName(fresh && items.length === 0 ? query : "");
    savedInModal.current = false;
    setOpen(false);
    setModalOpen(true);
  }

  function handleSaved(saved: SavedClient) {
    savedInModal.current = true;
    onError(null);
    pick(saved, true);
  }

  function handleModalClose() {
    setModalOpen(false);
    // Cancelar: volta o foco para a busca. Salvar: o foco ja foi para o proximo campo.
    if (!savedInModal.current) inputRef.current?.focus();
    savedInModal.current = false;
  }

  return (
    <section ref={sectionRef} className="border border-gray-200 p-6 dark:border-neutral-800">
      <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-neutral-100">Cliente</h2>

      {!clientId ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="clientSearch" className={labelClass}>
            Buscar cliente
          </label>
          <div ref={wrapperRef} className="relative" onBlur={handleBlur}>
            <input
              ref={inputRef}
              id="clientSearch"
              type="text"
              role="combobox"
              aria-expanded={showList}
              aria-controls={showList ? listboxId : undefined}
              aria-activedescendant={activeClient ? optionId(activeClient.id) : undefined}
              aria-autocomplete="list"
              aria-busy={showLoading}
              autoComplete="off"
              value={text}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              onFocus={handleFocus}
              onClick={() => setOpen(true)}
              placeholder="Digite o nome..."
              className={inputClass}
            />

            {open && (
              <div className="absolute inset-x-0 top-full z-20 mt-1 border border-gray-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                {showList && (
                  <>
                    {!query && <p className="px-3 pt-2 text-xs font-medium text-gray-500 dark:text-neutral-400">Recentes</p>}
                    <ul
                      id={listboxId}
                      role="listbox"
                      aria-label={query ? "Clientes encontrados" : "Clientes recentes"}
                      className="flex max-h-60 flex-col overflow-y-auto py-1"
                    >
                      {items.map((c, index) => (
                        <li
                          key={c.id}
                          id={optionId(c.id)}
                          role="option"
                          aria-selected={index === activeIndex}
                          // Mouse: escolhe sem tirar o foco da busca antes da hora.
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => pick(c, false)}
                          className={`block w-full cursor-pointer px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-neutral-300 dark:hover:bg-neutral-800 ${
                            index === activeIndex ? "bg-gray-100 dark:bg-neutral-800" : ""
                          }`}
                        >
                          {c.name}
                          {c.tradeName ? ` (${c.tradeName})` : ""}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {showEmpty && (
                  <div className="flex flex-col items-start gap-2 px-3 py-3">
                    <p className="text-sm text-gray-500 dark:text-neutral-400">{query ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}</p>
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={openCreateModal} className={linkButtonClass}>
                      Criar novo cliente
                    </button>
                  </div>
                )}
                {showLoading && <p className="px-3 py-2 text-xs text-gray-500 dark:text-neutral-400">Buscando...</p>}
                {failed && (
                  <p role="alert" className="px-3 py-2 text-xs text-red-600 dark:text-red-400">
                    Não foi possível buscar clientes.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* A acao tambem fica na lista vazia; aqui so quando ela nao esta. */}
          {!showEmpty && (
            <button type="button" onClick={openCreateModal} className={`${linkButtonClass} self-start`}>
              + Criar novo cliente
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-900 dark:text-neutral-100">{selected?.name}</p>
          <button type="button" onClick={clearSelection} className={linkButtonClass}>
            Trocar
          </button>
        </div>
      )}

      {modalOpen &&
        createPortal(
          <div onSubmit={stopBubbling} onKeyDown={stopBubbling} onFocus={stopBubbling} onBlur={stopBubbling}>
            <ClientFormModal open onClose={handleModalClose} onSaved={handleSaved} initialName={modalName} autoFocusName refreshOnSave={false} />
          </div>,
          document.body
        )}
    </section>
  );
}
