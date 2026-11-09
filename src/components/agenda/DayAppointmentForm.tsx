"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Currency } from "@prisma/client";
import { Plus, Trash2 } from "lucide-react";
import { MoneyInput } from "@/components/MoneyInput";
import { SubmitButton } from "@/components/SubmitButton";
import { ClientPicker, type ClientOption } from "@/components/agenda/ClientPicker";
import { InstallmentsEditor, roundMoney, sumInstallmentRows, type InstallmentRow } from "@/components/vendas/InstallmentsEditor";
import { formatMoney, isIntegerCurrency } from "@/lib/money";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/sales/options";
import { useEnterToNextField } from "@/components/forms/useEnterToNextField";

// Formulario do fluxo POR DIA (DAY, Agenda A3) - criar e editar. Sem horario,
// sem duracao, sem conflito de horario: o dia, os servicos com valor, a
// categoria de receita e o pagamento ficam definidos aqui, que e o que
// permite concluir o atendimento sem perguntar nada depois. Previa em ponto
// flutuante so para UX; o backend revalida tudo (dayAppointmentInputSchema).

export type DayServiceOption = { id: string; name: string; defaultPrice: string };
export type DayCategoryOption = { id: string; name: string };
export type DayServiceRow = { productId: string; quantity: string; unitPrice: string };

export type DayAppointmentInitial = {
  id: string;
  clientId: string;
  scheduledOn: string;
  services: DayServiceRow[];
  categoryId: string;
  paymentTiming: "AVISTA" | "APRAZO";
  paymentMethod: string;
  installments: InstallmentRow[];
  notes: string;
};

const linkButtonClass = "text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400";
const primaryButtonClass =
  "bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200";
const secondaryButtonClass =
  "border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";
const inputClass =
  "w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
const labelClass = "mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300";
const sectionClass = "border border-gray-200 p-6 dark:border-neutral-800";
const timingButtonClass = (active: boolean) =>
  `flex-1 px-3 py-2 text-sm font-medium transition ${
    active
      ? "bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-neutral-800 dark:text-neutral-400"
  }`;

export function DayAppointmentForm({
  mode,
  initial,
  initialClient,
  services,
  categories,
  defaultCategoryId,
  currency,
  todayKey,
  initialServiceIds,
  initialDate,
}: {
  mode: "create" | "edit";
  initial?: DayAppointmentInitial;
  // Cliente ja escolhido ao abrir a tela (edicao, ou "agendar o proximo"); a
  // lista de clientes nao vem mais da pagina - o ClientPicker busca no servidor.
  initialClient?: ClientOption | null;
  services: DayServiceOption[];
  categories: DayCategoryOption[];
  // Categoria de receita pre-selecionada na criacao ("Venda de serviços").
  defaultCategoryId: string | null;
  currency: Currency;
  // "Hoje" da EMPRESA (DateKey), calculado no servidor - nunca o do navegador.
  todayKey: string;
  // Prefills da criacao: "agendar o proximo" (servicos; o cliente vem em
  // `initialClient`) e o dia clicado em "+ Novo agendamento nesta data".
  initialServiceIds?: string[];
  initialDate?: string;
}) {
  const enterNav = useEnterToNextField<HTMLFormElement>();
  const router = useRouter();
  const decimals = isIntegerCurrency(currency) ? 0 : 2;

  const [localServices, setLocalServices] = useState(services);
  const [clientId, setClientId] = useState(initial?.clientId ?? initialClient?.id ?? "");
  const [rows, setRows] = useState<DayServiceRow[]>(
    () =>
      initial?.services ??
      (initialServiceIds ?? [])
        .map((id) => services.find((s) => s.id === id))
        .filter((s): s is DayServiceOption => Boolean(s))
        .map((s) => ({ productId: s.id, quantity: "1", unitPrice: s.defaultPrice }))
  );
  const [scheduledOn, setScheduledOn] = useState(initial?.scheduledOn ?? initialDate ?? todayKey);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? defaultCategoryId ?? "");
  const [paymentTiming, setPaymentTiming] = useState<"AVISTA" | "APRAZO">(initial?.paymentTiming ?? "AVISTA");
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod ?? "");
  const [installments, setInstallments] = useState<InstallmentRow[]>(
    () => (initial && initial.installments.length > 0 ? initial.installments : [{ dueDateInput: initial?.scheduledOn ?? initialDate ?? todayKey, amount: "" }])
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [showCreateService, setShowCreateService] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [savingService, setSavingService] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const total = useMemo(
    () => roundMoney(rows.reduce((t, r) => t + (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0), 0), decimals),
    [rows, decimals]
  );
  const availableServices = localServices.filter((s) => !rows.some((r) => r.productId === s.id));
  const serviceName = (id: string) => localServices.find((s) => s.id === id)?.name ?? "";

  function addService(id: string) {
    const service = localServices.find((s) => s.id === id);
    if (!service || rows.some((r) => r.productId === id)) return;
    setRows((prev) => [...prev, { productId: id, quantity: "1", unitPrice: service.defaultPrice }]);
  }

  function updateRow(index: number, patch: Partial<DayServiceRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function createServiceInline() {
    if (!newServiceName.trim()) return;
    setSavingService(true);
    setError(null);
    try {
      // Sem duracao: o fluxo por dia nao tem horario (Agenda A3).
      const res = await fetch("/api/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newServiceName, type: "SERVICO", defaultPrice: newServicePrice || undefined }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(result.error ?? "Não foi possível criar o serviço.");
        return;
      }
      const created = { id: result.id as string, name: newServiceName, defaultPrice: newServicePrice };
      setLocalServices((prev) => [...prev, created]);
      setRows((prev) => [...prev, { productId: created.id, quantity: "1", unitPrice: newServicePrice }]);
      setNewServiceName("");
      setNewServicePrice("");
      setShowCreateService(false);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSavingService(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!clientId) return setError("Selecione um cliente.");
    if (rows.length === 0) return setError("Adicione ao menos um serviço.");
    if (rows.some((r) => !r.quantity || Number(r.quantity) < 1 || r.unitPrice === "")) {
      return setError("Preencha quantidade e valor de todos os serviços.");
    }
    if (!scheduledOn) return setError("Informe a data do atendimento.");
    if (!categoryId) return setError("Selecione uma categoria de receita.");
    if (paymentTiming === "APRAZO") {
      if (installments.some((i) => !i.dueDateInput || !i.amount)) return setError("Preencha vencimento e valor de todas as parcelas.");
      const sum = sumInstallmentRows(installments, decimals);
      if (sum !== total) {
        return setError(`A soma das parcelas (${formatMoney(sum, currency)}) não bate com o total do atendimento (${formatMoney(total, currency)}).`);
      }
    }

    setPending(true);
    try {
      const payload = {
        clientId,
        scheduledOn,
        services: rows.map((r) => ({ productId: r.productId, quantity: r.quantity, unitPrice: r.unitPrice })),
        categoryId,
        paymentTiming,
        paymentMethod: paymentMethod || undefined,
        installments: paymentTiming === "APRAZO" ? installments.map((i) => ({ dueOn: i.dueDateInput, amount: i.amount })) : [],
        notes: notes || undefined,
      };
      const res = await fetch(mode === "create" ? "/api/agenda" : `/api/agenda/${initial!.id}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(result.error ?? "Não foi possível salvar o agendamento.");
        return;
      }
      router.push(`/agenda?view=day&day=${scheduledOn}`);
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form {...enterNav} onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <ClientPicker clientId={clientId} initialClient={initialClient} onChange={setClientId} onError={setError} />

      <section className={sectionClass}>
        <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-neutral-100">Serviços</h2>

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
          <select aria-label="Adicionar serviço" value="" onChange={(e) => addService(e.target.value)} className={inputClass}>
            <option value="">Adicionar serviço...</option>
            {availableServices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        {localServices.length === 0 && <p className="text-sm text-gray-500 dark:text-neutral-400">Nenhum serviço cadastrado ainda.</p>}

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
      </section>

      <section className={sectionClass}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="scheduledOn" className={labelClass}>
              Data do atendimento
            </label>
            <input id="scheduledOn" type="date" value={scheduledOn} onChange={(e) => setScheduledOn(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="categoryId" className={labelClass}>
              Categoria de receita
            </label>
            <select id="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
              <option value="">Selecione...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-neutral-100">Pagamento</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span className={labelClass}>Condição</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPaymentTiming("AVISTA")} aria-pressed={paymentTiming === "AVISTA"} className={timingButtonClass(paymentTiming === "AVISTA")}>
                À vista
              </button>
              <button type="button" onClick={() => setPaymentTiming("APRAZO")} aria-pressed={paymentTiming === "APRAZO"} className={timingButtonClass(paymentTiming === "APRAZO")}>
                A prazo
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="paymentMethod" className={labelClass}>
              Meio de pagamento (opcional)
            </label>
            <select id="paymentMethod" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputClass}>
              <option value="">Não informado</option>
              {PAYMENT_METHOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {paymentTiming === "AVISTA" ? (
          <p className="mt-3 text-xs text-gray-500 dark:text-neutral-400">Recebido no dia do atendimento, quando ele for concluído.</p>
        ) : (
          <InstallmentsEditor
            installments={installments}
            onChange={setInstallments}
            currency={currency}
            total={total}
            baseDate={scheduledOn}
            todayKey={scheduledOn || todayKey}
            showSplit
            mismatchClassName="font-semibold text-gray-900 dark:text-neutral-100"
          />
        )}
      </section>

      <section className={sectionClass}>
        <label htmlFor="notes" className="mb-2 block text-sm font-semibold text-gray-900 dark:text-neutral-100">
          Observação (opcional)
        </label>
        <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} className={inputClass} />
        <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">Não registre informações de saúde ou dados sensíveis do cliente.</p>
      </section>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <SubmitButton pending={pending} pendingText="Salvando...">
        {mode === "create" ? "Agendar" : "Salvar alterações"}
      </SubmitButton>
    </form>
  );
}
