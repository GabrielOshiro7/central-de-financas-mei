"use client";

import { SensitiveDataNotice } from "@/components/SensitiveDataNotice";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Currency } from "@prisma/client";
import { SubmitButton } from "@/components/SubmitButton";
import { ClientPicker, type ClientOption } from "@/components/agenda/ClientPicker";
import { timingButtonClass } from "@/components/agenda/paymentTimingStyles";
import { ServiceRows, servicesTotal, type DayServiceOption, type DayServiceRow } from "@/components/agenda/ServiceRows";
import { InstallmentsEditor, sumInstallmentRows, type InstallmentRow } from "@/components/vendas/InstallmentsEditor";
import { formatMoney, isIntegerCurrency } from "@/lib/money";
import { isDateKey } from "@/lib/time/zoned";
import { rebaseMonthlyDates } from "@/lib/installments/monthly";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/sales/options";
import { useEnterToNextField } from "@/components/forms/useEnterToNextField";
import { APPOINTMENT_TITLE_MAX_LENGTH } from "@/lib/agenda/options";

// Formulario do fluxo POR DIA (DAY, Agenda A3) - criar e editar. Sem horario,
// sem duracao, sem conflito de horario: o dia, os servicos com valor, a
// categoria de receita e o pagamento ficam definidos aqui, que e o que
// permite concluir o atendimento sem perguntar nada depois. Previa em ponto
// flutuante so para UX; o backend revalida tudo (dayAppointmentInputSchema).
//
// SEM VALOR (total zero, ex.: reuniao): as secoes Categoria de receita e
// Pagamento ficam ocultas e nao sao enviadas, o cliente e opcional e aparece o
// aviso "Sem valor: nao gera receita". Ao haver valor > 0 as secoes voltam,
// pre-preenchidas como sempre. Todo agendamento precisa de ao menos um entre
// titulo, cliente e servico.

export type { DayServiceOption, DayServiceRow } from "@/components/agenda/ServiceRows";
export type DayCategoryOption = { id: string; name: string };

export type DayAppointmentInitial = {
  id: string;
  // "" quando o agendamento (sem valor) nao tem cliente.
  clientId: string;
  title: string;
  scheduledOn: string;
  services: DayServiceRow[];
  categoryId: string;
  paymentTiming: "AVISTA" | "APRAZO";
  paymentMethod: string;
  installments: InstallmentRow[];
  notes: string;
};

const inputClass =
  "w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
const labelClass = "mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300";
const sectionClass = "border border-gray-200 p-6 dark:border-neutral-800";

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
  const [title, setTitle] = useState(initial?.title ?? "");
  const [rows, setRows] = useState<DayServiceRow[]>(
    () =>
      initial?.services ??
      (initialServiceIds ?? [])
        .map((id) => services.find((s) => s.id === id))
        .filter((s): s is DayServiceOption => Boolean(s))
        .map((s) => ({ productId: s.id, quantity: "1", unitPrice: s.defaultPrice }))
  );
  const [scheduledOn, setScheduledOn] = useState(initial?.scheduledOn ?? initialDate ?? todayKey);
  const [categoryId, setCategoryId] = useState(initial?.categoryId || defaultCategoryId || "");
  const [paymentTiming, setPaymentTiming] = useState<"AVISTA" | "APRAZO">(initial?.paymentTiming ?? "AVISTA");
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod ?? "");
  const [installments, setInstallments] = useState<InstallmentRow[]>(
    () => (initial && initial.installments.length > 0 ? initial.installments : [{ dueDateInput: initial?.scheduledOn ?? initialDate ?? todayKey, amount: "" }])
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const total = useMemo(() => servicesTotal(rows, decimals), [rows, decimals]);
  // Sem valor: total zero (sem servicos ou so servicos de valor 0).
  const noValue = total <= 0;

  // A 1a parcela vence, por padrao, no dia do atendimento: enquanto ela ainda esta
  // nesse dia (o usuario nao a personalizou), acompanha a mudanca do dia e as
  // demais (mensais) vao junto.
  function changeScheduledOn(value: string) {
    if (isDateKey(value) && installments[0]?.dueDateInput === scheduledOn) {
      setInstallments((prev) => rebaseMonthlyDates(prev, value));
    }
    setScheduledOn(value);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return; // guarda contra envio duplo (Enter repetido / duplo clique)
    setError(null);

    if (rows.some((r) => !r.quantity || Number(r.quantity) < 1 || r.unitPrice === "")) {
      return setError("Preencha quantidade e valor de todos os serviços.");
    }
    if (!clientId && rows.length === 0 && !title.trim()) return setError("Informe ao menos um título, cliente ou serviço.");
    if (!scheduledOn) return setError("Informe a data do atendimento.");
    // Com valor: cliente, categoria e pagamento obrigatorios. Sem valor: nada disso.
    if (!noValue) {
      if (!clientId) return setError("Selecione um cliente.");
      if (!categoryId) return setError("Selecione uma categoria de receita.");
    }
    if (!noValue && paymentTiming === "APRAZO") {
      if (installments.some((i) => !i.dueDateInput || !i.amount)) return setError("Preencha vencimento e valor de todas as parcelas.");
      const sum = sumInstallmentRows(installments, decimals);
      if (sum !== total) {
        return setError(`A soma das parcelas (${formatMoney(sum, currency)}) não bate com o total do atendimento (${formatMoney(total, currency)}).`);
      }
    }

    setPending(true);
    try {
      // Sem valor, categoria/pagamento/parcelas nao vao no payload (mesmo que o
      // usuario os tenha preenchido antes de zerar o valor).
      const payload = {
        clientId: clientId || undefined,
        title: title.trim() || undefined,
        scheduledOn,
        services: rows.map((r) => ({ productId: r.productId, quantity: r.quantity, unitPrice: r.unitPrice })),
        ...(noValue
          ? {}
          : {
              categoryId,
              paymentTiming,
              paymentMethod: paymentMethod || undefined,
              installments: paymentTiming === "APRAZO" ? installments.map((i) => ({ dueOn: i.dueDateInput, amount: i.amount })) : [],
            }),
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
        setPending(false);
        return;
      }
      // Sucesso: o formulario navega para outra tela. O pending NAO volta a false aqui (o botao fica travado
      // ate a tela trocar): um Enter/clique nesse intervalo nao manda um segundo envio. So os caminhos de
      // erro (resposta nao-ok, excecao) destravam o botao.
      router.push(`/agenda?view=day&day=${scheduledOn}`);
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setPending(false);
    }
  }

  return (
    <form {...enterNav} onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <section className={sectionClass}>
        <label htmlFor="appointmentTitle" className="mb-2 block text-sm font-semibold text-gray-900 dark:text-neutral-100">
          Título (opcional)
        </label>
        <input
          id="appointmentTitle"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={APPOINTMENT_TITLE_MAX_LENGTH}
          placeholder="Ex.: Reunião com contador"
          className={inputClass}
        />
      </section>

      <ClientPicker clientId={clientId} initialClient={initialClient} onChange={setClientId} onError={setError} optional={noValue} />

      <ServiceRows services={localServices} setServices={setLocalServices} rows={rows} setRows={setRows} currency={currency} total={total} onError={setError} />

      <section className={sectionClass}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="scheduledOn" className={labelClass}>
              Data do atendimento
            </label>
            <input id="scheduledOn" type="date" value={scheduledOn} onChange={(e) => changeScheduledOn(e.target.value)} className={inputClass} />
          </div>
          {!noValue && (
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
          )}
        </div>
      </section>

      {!noValue && (
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
            mode="monthly"
            mismatchClassName="font-semibold text-gray-900 dark:text-neutral-100"
          />
        )}
      </section>
      )}

      <section className={sectionClass}>
        <label htmlFor="notes" className="mb-2 block text-sm font-semibold text-gray-900 dark:text-neutral-100">
          Observação (opcional)
        </label>
        <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} className={inputClass} />
        <SensitiveDataNotice />
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
