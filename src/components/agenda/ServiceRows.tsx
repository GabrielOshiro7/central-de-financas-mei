"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { Currency } from "@prisma/client";
import { Plus, Trash2 } from "lucide-react";
import { MoneyInput } from "@/components/MoneyInput";
import { formatMoney } from "@/lib/money";
import { roundMoney } from "@/components/vendas/InstallmentsEditor";

// Servicos do agendamento por dia: linhas (quantidade e valor unitario), "Adicionar servico", "Criar novo servico"
// inline (mini-formulario com Enter proprio), Total e o aviso "Sem valor". Compartilhado pelo formulario de EDICAO
// (DayAppointmentForm, pagina) e pelo popup de NOVO agendamento (NewAppointmentModal): uma unica implementacao da
// regra. `variant="card"` = secao com borda (pagina); `variant="plain"` = sem borda nem padding (dentro do popup, que
// ja e o "cartao" - sem card dentro de card).
//
// Previa em ponto flutuante so para UX; o backend revalida tudo (dayAppointmentInputSchema).

export type DayServiceOption = { id: string; name: string; defaultPrice: string };
export type DayServiceRow = { productId: string; quantity: string; unitPrice: string };

// Total do agendamento (previa): soma de quantidade x valor unitario, arredondada nas casas da moeda.
export function servicesTotal(rows: DayServiceRow[], decimals: number): number {
  return roundMoney(rows.reduce((t, r) => t + (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0), 0), decimals);
}

const linkButtonClass = "text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400";
const primaryButtonClass =
  "bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200";
const secondaryButtonClass =
  "border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";
const inputClass =
  "w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
const labelClass = "mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300";
const sectionClass = "border border-gray-200 p-6 dark:border-neutral-800";

export function ServiceRows({
  services,
  setServices,
  rows,
  setRows,
  currency,
  total,
  onError,
  variant = "card",
  skipAddSelectOnEnter = false,
}: {
  services: DayServiceOption[];
  setServices: Dispatch<SetStateAction<DayServiceOption[]>>;
  rows: DayServiceRow[];
  setRows: Dispatch<SetStateAction<DayServiceRow[]>>;
  currency: Currency;
  total: number;
  onError: (message: string | null) => void;
  variant?: "card" | "plain";
  // Popup de novo agendamento: com ao menos uma linha de servico, o seletor "Adicionar servico" e IGNORADO pela navegacao
  // por Enter (data-enter-skip): Enter no valor da ultima linha ja e "Proximo", um Enter so. Sem linhas, o seletor
  // continua sendo o ultimo campo (Enter nele = Proximo). A pagina de edicao nao liga isto (comportamento de antes).
  skipAddSelectOnEnter?: boolean;
}) {
  const [showCreateService, setShowCreateService] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [savingService, setSavingService] = useState(false);

  // Sem valor: total zero (sem servicos ou so servicos de valor 0).
  const noValue = total <= 0;
  const availableServices = services.filter((s) => !rows.some((r) => r.productId === s.id));
  const serviceName = (id: string) => services.find((s) => s.id === id)?.name ?? "";

  function addService(id: string) {
    const service = services.find((s) => s.id === id);
    if (!service || rows.some((r) => r.productId === id)) return;
    setRows((prev) => [...prev, { productId: id, quantity: "1", unitPrice: service.defaultPrice }]);
  }

  function updateRow(index: number, patch: Partial<DayServiceRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function createServiceInline() {
    if (!newServiceName.trim()) return;
    setSavingService(true);
    onError(null);
    try {
      // Sem duracao: o fluxo por dia nao tem horario (Agenda A3).
      const res = await fetch("/api/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newServiceName, type: "SERVICO", defaultPrice: newServicePrice || undefined }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(result.error ?? "Não foi possível criar o serviço.");
        return;
      }
      const created = { id: result.id as string, name: newServiceName, defaultPrice: newServicePrice };
      setServices((prev) => [...prev, created]);
      setRows((prev) => [...prev, { productId: created.id, quantity: "1", unitPrice: newServicePrice }]);
      setNewServiceName("");
      setNewServicePrice("");
      setShowCreateService(false);
    } catch {
      onError("Erro de conexão. Tente novamente.");
    } finally {
      setSavingService(false);
    }
  }

  return (
    <section className={variant === "card" ? sectionClass : undefined}>
      {variant === "card" && <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-neutral-100">Serviços</h2>}

      {rows.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2">
          {rows.map((row, index) => (
            <li key={row.productId} className="grid grid-cols-1 gap-2 border border-gray-200 p-3 sm:grid-cols-12 sm:items-end dark:border-neutral-800">
              <p className="text-sm font-medium text-gray-900 sm:col-span-4 sm:pb-2 dark:text-neutral-100">{serviceName(row.productId)}</p>
              <div className="sm:col-span-2">
                <label htmlFor={`serviceQuantity-${index}`} className={labelClass}>
                  Quantidade
                </label>
                <input
                  id={`serviceQuantity-${index}`}
                  type="number"
                  min={1}
                  step={1}
                  value={row.quantity}
                  onChange={(e) => updateRow(index, { quantity: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-4">
                <label htmlFor={`servicePrice-${index}`} className={labelClass}>
                  Valor unitário
                </label>
                <MoneyInput
                  id={`servicePrice-${index}`}
                  currency={currency}
                  value={row.unitPrice}
                  onChange={(value) => updateRow(index, { unitPrice: value })}
                />
              </div>
              <div className="sm:col-span-2 sm:pb-2">
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                  className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400"
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {availableServices.length > 0 && (
        <select
          aria-label="Adicionar serviço"
          value=""
          onChange={(e) => addService(e.target.value)}
          data-enter-skip={skipAddSelectOnEnter && rows.length > 0 ? "" : undefined}
          className={inputClass}
        >
          <option value="">Adicionar serviço...</option>
          {availableServices.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      {services.length === 0 && <p className="text-sm text-gray-500 dark:text-neutral-400">Nenhum serviço cadastrado ainda.</p>}

      {!showCreateService ? (
        <button type="button" onClick={() => setShowCreateService(true)} className={`${linkButtonClass} mt-2 inline-flex items-center gap-1`}>
          <Plus size={14} aria-hidden="true" />
          Criar novo serviço
        </button>
      ) : (
        <div data-enter-group="" className="mt-2 flex flex-col gap-2 border border-gray-200 p-3 dark:border-neutral-800">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor="newServiceName" className={labelClass}>
                Nome do serviço
              </label>
              <input id="newServiceName" type="text" value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="newServicePrice" className={labelClass}>
                Preço (opcional)
              </label>
              <MoneyInput id="newServicePrice" currency={currency} value={newServicePrice} onChange={setNewServicePrice} />
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-neutral-400">Preço com imposto incluído (総額表示).</p>
          <div className="flex gap-2">
            <button type="button" data-enter-confirm="" onClick={createServiceInline} disabled={savingService} className={primaryButtonClass}>
              {savingService ? "Salvando..." : "Criar serviço"}
            </button>
            <button type="button" onClick={() => setShowCreateService(false)} className={secondaryButtonClass}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-between bg-gray-50 p-4 text-base font-semibold text-gray-900 dark:bg-neutral-800 dark:text-neutral-100">
        <span>Total</span>
        <span data-testid="day-appointment-total">{formatMoney(total, currency)}</span>
      </div>
      {noValue && (
        <p data-testid="no-value-notice" className="mt-2 text-xs text-gray-500 dark:text-neutral-400">
          Sem valor: não gera receita.
        </p>
      )}
    </section>
  );
}
