"use client";

import { useCallback, useEffect, useId, useRef, useState, type Dispatch, type FocusEvent, type FormEvent, type MutableRefObject, type SetStateAction } from "react";
import type { Currency } from "@prisma/client";
import { FormField } from "@/components/FormField";
import { SubmitButton } from "@/components/SubmitButton";
import { SensitiveDataNotice } from "@/components/SensitiveDataNotice";
import { ConfirmDialog } from "@/components/financeiro/ConfirmDialog";
import { ClientPicker, type ClientOption } from "@/components/agenda/ClientPicker";
import { timingButtonClass } from "@/components/agenda/paymentTimingStyles";
import { ServiceRows, servicesTotal, type DayServiceOption, type DayServiceRow } from "@/components/agenda/ServiceRows";
import { InstallmentsEditor, type InstallmentRow } from "@/components/vendas/InstallmentsEditor";
import { useDialogFocus } from "@/components/useDialogFocus";
import { useEnterToNextField } from "@/components/forms/useEnterToNextField";
import { formatMoney, isIntegerCurrency } from "@/lib/money";
import { isDateKey } from "@/lib/time/zoned";
import { rebaseMonthlyDates } from "@/lib/installments/monthly";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/sales/options";
import { APPOINTMENT_TITLE_MAX_LENGTH } from "@/lib/agenda/options";
import { CLIENT_CONTACT_MAX_LENGTH, CLIENT_COUNTRY_CODE_HINT } from "@/lib/clients/options";
import type { PopupGuard, PopupPrefill } from "@/lib/agenda/popupUrl";
import {
  STEP_LABELS,
  counterLabel,
  counterSpokenLabel,
  hasFilledData,
  stepsFor,
  validateAllSteps,
  validateStep,
  type AppointmentDraft,
  type DraftBaseline,
  type StepError,
  type StepId,
} from "@/lib/agenda/newAppointmentSteps";

// Popup "Novo agendamento" em passos (substitui a pagina /agenda/novo; a EDICAO continua pagina):
//   1 Cliente (titulo opcional, cliente, WhatsApp) -> 2 Servicos -> 3 Data (+ observacao) -> [4 Pagamento, so com valor].
// O estado de TODOS os passos vive aqui (passos nao visiveis ficam desmontados). O contador "x/N" acompanha o total ao
// vivo (3 sem valor, 4 com valor). Cada "Proximo" valida o passo; o backend continua validando tudo
// (dayAppointmentInputSchema). Enter no ultimo campo do passo aciona o botao primario (enterNavigation): so ha UM por
// passo - "Proximo" (type=button, data-enter-submit) ou "Salvar" (type=submit).
//
// Fechar: o clique no fundo NAO fecha. Esc e Cancelar fecham; com dado preenchido pedem "Descartar agendamento?"
// (ConfirmDialog empilhado). Durante o envio, Esc nao fecha.
//
// Os dados (servicos, categorias, moeda, "hoje" da empresa e o cliente do pre-preenchimento) vem de
// GET /api/agenda/new-form-data, buscado ao abrir.

type FormData = {
  services: DayServiceOption[];
  categories: { id: string; name: string }[];
  defaultCategoryId: string | null;
  currency: Currency;
  todayKey: string;
  initialClient: ClientOption | null;
};

type Draft = AppointmentDraft & {
  // Cliente escolhido (para o ClientPicker remontado ao voltar ao passo 1 mostrar o nome).
  client: ClientOption | null;
  // WhatsApp do cliente como foi carregado: so envia clientWhatsapp se o usuario mudou.
  originalWhatsapp: string;
  services: DayServiceOption[];
};

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: FormData };

const labelClass = "mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300";
const inputClass =
  "w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
const linkButtonClass = "text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400";
const secondaryButtonClass =
  "flex-1 border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";
const primaryButtonClass =
  "w-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200";
const FIELD_SELECTOR = "input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled])";

export function NewAppointmentModal({
  prefill,
  onClose,
  onSaved,
  guardRef,
}: {
  prefill: PopupPrefill;
  onClose: () => void;
  // O anfitriao usa isto no botao Voltar do navegador: se ha dado preenchido, mantem o popup e pede a confirmacao.
  guardRef?: MutableRefObject<PopupGuard | null>;
  // Chamado depois de salvar, com o dia do atendimento ("AAAA-MM-DD"). Quem abriu fecha o popup e atualiza a Agenda.
  onSaved: (scheduledOn: string) => void;
}) {
  const titleId = useId();
  const subtitleId = useId();
  const enterNav = useEnterToNextField<HTMLFormElement>();
  const prefillRef = useRef(prefill);

  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const baselineRef = useRef<DraftBaseline>({ scheduledOn: "", categoryId: "" });
  const [stepIndex, setStepIndex] = useState(0);
  const [stepError, setStepError] = useState<StepError | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const stepRef = useRef<HTMLDivElement>(null);
  const lastFieldByStep = useRef<Partial<Record<StepId, string>>>({});
  const pendingFocus = useRef<{ kind: "first" | "restore" | "id"; id?: string } | null>(null);

  const data = load.status === "ready" ? load.data : null;
  const currency = data?.currency ?? "BRL";
  const decimals = isIntegerCurrency(currency) ? 0 : 2;
  const total = draft ? servicesTotal(draft.rows, decimals) : 0;
  const money = (value: number) => formatMoney(value, currency);
  const steps = stepsFor(total);
  const index = Math.min(stepIndex, steps.length - 1);
  const stepId = steps[index];
  const isLast = index === steps.length - 1;

  function requestClose() {
    if (pending) return;
    if (draft && hasFilledData(draft, baselineRef.current)) setConfirmingDiscard(true);
    else onClose();
  }

  // Entrega ao anfitriao o estado atual (sem render extra): ha dado preenchido? e "pedir para fechar" (a mesma
  // confirmacao do Esc/Cancelar).
  useEffect(() => {
    if (!guardRef) return;
    guardRef.current = { hasData: () => Boolean(draft && hasFilledData(draft, baselineRef.current)), requestClose };
    return () => {
      guardRef.current = null;
    };
  });

  // Foco do dialogo: entra ao abrir, Tab preso, Esc (pede confirmacao se ha dado) e volta ao botao de origem.
  const dialogRef = useDialogFocus<HTMLDivElement>(true, pending ? undefined : requestClose);

  // Busca os dados do popup ao abrir (e a cada "Tentar de novo").
  useEffect(() => {
    const controller = new AbortController();
    const wanted = prefillRef.current;
    (async () => {
      try {
        const query = wanted.clientId ? `?clientId=${encodeURIComponent(wanted.clientId)}` : "";
        const res = await fetch(`/api/agenda/new-form-data${query}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const result = (await res.json()) as FormData;
        if (controller.signal.aborted) return;
        const scheduledOn = wanted.date ?? result.todayKey;
        const seen = new Set<string>();
        const rows: DayServiceRow[] = [];
        for (const id of wanted.serviceIds) {
          const service = result.services.find((s) => s.id === id);
          if (!service || seen.has(id)) continue;
          seen.add(id);
          rows.push({ productId: id, quantity: "1", unitPrice: service.defaultPrice });
        }
        const client = result.initialClient;
        const defaultCategoryId = result.defaultCategoryId ?? "";
        baselineRef.current = { scheduledOn, categoryId: defaultCategoryId };
        setDraft({
          title: "",
          clientId: client?.id ?? "",
          client,
          whatsapp: client?.whatsapp ?? "",
          originalWhatsapp: client?.whatsapp ?? "",
          services: result.services,
          rows,
          scheduledOn,
          notes: "",
          categoryId: defaultCategoryId,
          paymentTiming: "AVISTA",
          paymentMethod: "",
          installments: [{ dueDateInput: scheduledOn, amount: "" }],
        });
        setLoad({ status: "ready", data: result });
      } catch {
        if (!controller.signal.aborted) setLoad({ status: "error" });
      }
    })();
    return () => controller.abort();
  }, [attempt]);

  const patch = useCallback((changes: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...changes } : current)), []);

  const setRows: Dispatch<SetStateAction<DayServiceRow[]>> = (action) =>
    setDraft((current) => (current ? { ...current, rows: typeof action === "function" ? action(current.rows) : action } : current));
  const setServices: Dispatch<SetStateAction<DayServiceOption[]>> = (action) =>
    setDraft((current) => (current ? { ...current, services: typeof action === "function" ? action(current.services) : action } : current));
  const setInstallments = (installments: InstallmentRow[]) => patch({ installments });

  // A 1a parcela vence, por padrao, no dia do atendimento: enquanto ela ainda esta nesse dia, acompanha a mudanca do dia.
  function changeScheduledOn(value: string) {
    if (!draft) return;
    if (isDateKey(value) && draft.installments[0]?.dueDateInput === draft.scheduledOn) {
      patch({ scheduledOn: value, installments: rebaseMonthlyDates(draft.installments, value) });
    } else {
      patch({ scheduledOn: value });
    }
  }

  // --- foco por passo -------------------------------------------------------------------------------------------
  // Registra o ultimo campo focado em cada passo (para o Voltar devolver o foco a ele).
  function trackFocus(event: FocusEvent<HTMLFormElement>) {
    const target = event.target as HTMLElement;
    if (target.id && stepRef.current?.contains(target) && target.matches(FIELD_SELECTOR)) lastFieldByStep.current[stepId] = target.id;
  }

  useEffect(() => {
    const request = pendingFocus.current;
    if (!request) return;
    pendingFocus.current = null;
    const container = stepRef.current;
    if (!container) return;
    const focusFirst = () => container.querySelector<HTMLElement>(FIELD_SELECTOR)?.focus();
    if (request.kind === "id" && request.id) {
      (document.getElementById(request.id) ?? container.querySelector<HTMLElement>(FIELD_SELECTOR))?.focus();
    } else if (request.kind === "restore") {
      const saved = lastFieldByStep.current[stepId];
      const element = saved ? (document.getElementById(saved) as HTMLElement | null) : null;
      if (element && container.contains(element)) element.focus();
      else focusFirst();
    } else {
      focusFirst();
    }
  }, [index, stepId]);

  function goTo(target: number, focus: { kind: "first" | "restore" | "id"; id?: string }) {
    pendingFocus.current = focus;
    setStepIndex(target);
  }

  function showError(error: StepError) {
    setStepError(error);
    if (error.fieldId) {
      const id = error.fieldId;
      requestAnimationFrame(() => document.getElementById(id)?.focus());
    }
  }

  function next() {
    if (!draft || pending) return;
    const error = validateStep(stepId, draft, total, decimals, money);
    if (error) {
      showError(error);
      return;
    }
    setStepError(null);
    setServerError(null);
    goTo(index + 1, { kind: "first" });
  }

  function back() {
    if (pending) return;
    setStepError(null);
    setServerError(null);
    goTo(index - 1, { kind: "restore" });
  }

  // "Voltar e escolher cliente" (valor sem cliente): passo 1 com o foco na busca.
  function backToClient() {
    setStepError(null);
    goTo(0, { kind: "id", id: "clientSearch" });
  }

  // --- envio ----------------------------------------------------------------------------------------------------
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !draft) return; // guarda contra envio duplo (Enter repetido / duplo clique)
    setServerError(null);

    const error = validateAllSteps(draft, total, decimals, money);
    if (error) {
      const at = steps.indexOf(error.step);
      if (at >= 0 && at !== index) goTo(at, { kind: "first" });
      showError(error);
      return;
    }
    setStepError(null);

    setPending(true);
    try {
      const whatsappChanged = draft.clientId !== "" && draft.whatsapp.trim() !== draft.originalWhatsapp.trim();
      const noValue = total <= 0;
      const payload = {
        clientId: draft.clientId || undefined,
        title: draft.title.trim() || undefined,
        scheduledOn: draft.scheduledOn,
        services: draft.rows.map((r) => ({ productId: r.productId, quantity: r.quantity, unitPrice: r.unitPrice })),
        ...(noValue
          ? {}
          : {
              categoryId: draft.categoryId,
              paymentTiming: draft.paymentTiming,
              paymentMethod: draft.paymentMethod || undefined,
              installments: draft.paymentTiming === "APRAZO" ? draft.installments.map((i) => ({ dueOn: i.dueDateInput, amount: i.amount })) : [],
            }),
        notes: draft.notes || undefined,
        // So o WhatsApp do cliente escolhido, e so se o usuario mexeu; "" remove. Gravado na mesma transacao do agendamento.
        ...(whatsappChanged ? { clientWhatsapp: draft.whatsapp.trim() } : {}),
      };
      const res = await fetch("/api/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setServerError(result.error ?? "Não foi possível salvar o agendamento.");
        setPending(false);
        return;
      }
      // Sucesso: quem abriu fecha o popup (o pending fica ligado ate ele sair da tela).
      onSaved(draft.scheduledOn);
    } catch {
      setServerError("Erro de conexão. Tente novamente.");
      setPending(false);
    }
  }

  // --- passos ---------------------------------------------------------------------------------------------------
  function renderStep(current: Draft, id: StepId, fetched: FormData) {
    switch (id) {
      case "cliente":
        return (
          <>
            <FormField
              id="appointmentTitle"
              label="Título (opcional)"
              placeholder="Ex.: Reunião com contador"
              maxLength={APPOINTMENT_TITLE_MAX_LENGTH}
              value={current.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
            <ClientPicker
              variant="plain"
              clientId={current.clientId}
              initialClient={current.client}
              onChange={(clientId) => patch({ clientId })}
              onPick={(client) => patch({ client, whatsapp: client?.whatsapp ?? "", originalWhatsapp: client?.whatsapp ?? "" })}
              onError={setServerError}
              onEnterEmpty={next}
              hint="Obrigatório se houver serviço com valor."
            />
            {current.clientId && (
              <div>
                <FormField
                  id="clientWhatsapp"
                  label="WhatsApp (opcional)"
                  hint={`Só para você contatar o cliente; o sistema não envia mensagens. ${CLIENT_COUNTRY_CODE_HINT}`}
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  maxLength={CLIENT_CONTACT_MAX_LENGTH}
                  value={current.whatsapp}
                  onChange={(e) => patch({ whatsapp: e.target.value })}
                  error={stepError?.fieldId === "clientWhatsapp" ? stepError.message : undefined}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">Alterar aqui atualiza o cadastro do cliente.</p>
              </div>
            )}
          </>
        );
      case "servicos":
        return (
          <>
            <ServiceRows
              variant="plain"
              services={current.services}
              setServices={setServices}
              rows={current.rows}
              setRows={setRows}
              currency={fetched.currency}
              total={total}
              onError={setServerError}
              skipAddSelectOnEnter
            />
            {stepError?.step === "servicos" && (
              <div className="flex flex-col items-start gap-1">
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {stepError.message}
                </p>
                {stepError.needsClient && (
                  <button type="button" onClick={backToClient} className={linkButtonClass}>
                    Voltar e escolher cliente
                  </button>
                )}
              </div>
            )}
          </>
        );
      case "data":
        return (
          <>
            <FormField
              id="scheduledOn"
              label="Data do atendimento"
              type="date"
              value={current.scheduledOn}
              onChange={(e) => changeScheduledOn(e.target.value)}
              error={stepError?.fieldId === "scheduledOn" ? stepError.message : undefined}
            />
            <div>
              <label htmlFor="notes" className={labelClass}>
                Observação (opcional)
              </label>
              <textarea
                id="notes"
                value={current.notes}
                onChange={(e) => patch({ notes: e.target.value })}
                maxLength={500}
                rows={3}
                className={inputClass}
              />
              <SensitiveDataNotice />
            </div>
          </>
        );
      case "pagamento": {
        const categoryInvalid = stepError?.fieldId === "categoryId";
        return (
          <>
            <div>
              <label htmlFor="categoryId" className={labelClass}>
                Categoria de receita
              </label>
              <select
                id="categoryId"
                value={current.categoryId}
                onChange={(e) => patch({ categoryId: e.target.value })}
                aria-invalid={categoryInvalid}
                aria-describedby={categoryInvalid ? "categoryId-error" : undefined}
                className={inputClass}
              >
                <option value="">Selecione...</option>
                {fetched.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {categoryInvalid && (
                <p id="categoryId-error" role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {stepError?.message}
                </p>
              )}
            </div>
            <div>
              <span className={labelClass}>Condição</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => patch({ paymentTiming: "AVISTA" })} aria-pressed={current.paymentTiming === "AVISTA"} className={timingButtonClass(current.paymentTiming === "AVISTA")}>
                  À vista
                </button>
                <button type="button" onClick={() => patch({ paymentTiming: "APRAZO" })} aria-pressed={current.paymentTiming === "APRAZO"} className={timingButtonClass(current.paymentTiming === "APRAZO")}>
                  A prazo
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="paymentMethod" className={labelClass}>
                Meio de pagamento (opcional)
              </label>
              <select id="paymentMethod" value={current.paymentMethod} onChange={(e) => patch({ paymentMethod: e.target.value })} className={inputClass}>
                <option value="">Não informado</option>
                {PAYMENT_METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {current.paymentTiming === "AVISTA" ? (
              <p className="text-xs text-gray-500 dark:text-neutral-400">Recebido no dia do atendimento, quando ele for concluído.</p>
            ) : (
              <InstallmentsEditor
                installments={current.installments}
                onChange={setInstallments}
                currency={fetched.currency}
                total={total}
                baseDate={current.scheduledOn}
                todayKey={current.scheduledOn || fetched.todayKey}
                showSplit
                mode="monthly"
                mismatchClassName="font-semibold text-gray-900 dark:text-neutral-100"
              />
            )}
            {stepError?.step === "pagamento" && !categoryInvalid && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {stepError.message}
              </p>
            )}
          </>
        );
      }
    }
  }

  return (
    <>
      {/* O clique no fundo NAO fecha o popup (so Esc e Cancelar, com confirmacao se ha dado). */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div
          role="dialog"
          ref={dialogRef}
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={subtitleId}
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white p-6 shadow-lg dark:bg-neutral-900"
        >
          <h2 id={titleId} className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
            Novo agendamento
          </h2>
          {/* Subtitulo com o nome do passo: regiao "polite", o leitor de tela anuncia a troca de passo. */}
          <p id={subtitleId} aria-live="polite" className="mt-1 text-sm text-gray-600 dark:text-neutral-400">
            {draft ? (
              <>
                {STEP_LABELS[stepId]}
                <span className="sr-only"> — {counterSpokenLabel(index, steps.length)}</span>
              </>
            ) : load.status === "error" ? (
              "Não foi possível carregar"
            ) : (
              "Carregando"
            )}
          </p>

          {load.status === "loading" && (
            <p role="status" aria-busy="true" className="mt-6 text-sm text-gray-500 dark:text-neutral-400">
              Carregando...
            </p>
          )}

          {load.status === "error" && (
            <div className="mt-6 flex flex-col gap-3">
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                Não foi possível carregar os dados do agendamento. Tente novamente.
              </p>
              <div className="flex gap-3">
                <button type="button" onClick={requestClose} className={secondaryButtonClass}>
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoad({ status: "loading" });
                    setAttempt((n) => n + 1);
                  }}
                  className={`flex-1 ${primaryButtonClass}`}
                >
                  Tentar de novo
                </button>
              </div>
            </div>
          )}

          {draft && data && (
            <form {...enterNav} onFocus={(event) => { enterNav.onFocus(event); trackFocus(event); }} onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4" noValidate>
              <div ref={stepRef} className="flex flex-col gap-4">
                {renderStep(draft, stepId, data)}
              </div>

              {serverError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {serverError}
                </p>
              )}

              <div className="flex gap-3">
                {index === 0 ? (
                  <button type="button" onClick={requestClose} disabled={pending} className={secondaryButtonClass}>
                    Cancelar
                  </button>
                ) : (
                  <button type="button" onClick={back} disabled={pending} className={secondaryButtonClass}>
                    Voltar
                  </button>
                )}
                <div className="flex-1">
                  {isLast ? (
                    <SubmitButton pending={pending} pendingText="Salvando...">
                      Salvar
                    </SubmitButton>
                  ) : (
                    <button type="button" data-enter-submit="" onClick={next} className={primaryButtonClass}>
                      Próximo
                    </button>
                  )}
                </div>
              </div>

              {/* Contador no canto inferior direito: "1/3" (3 sem valor, x/4 com valor). */}
              <p className="-mt-2 text-right text-xs text-gray-500 dark:text-neutral-400" data-testid="step-counter">
                <span aria-hidden="true">{counterLabel(index, steps.length)}</span>
                <span className="sr-only">{counterSpokenLabel(index, steps.length)}</span>
              </p>
            </form>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmingDiscard}
        title="Descartar agendamento?"
        message="Os dados preenchidos serão perdidos."
        confirmLabel="Descartar"
        cancelLabel="Continuar editando"
        pending={false}
        onConfirm={onClose}
        onCancel={() => setConfirmingDiscard(false)}
      />
    </>
  );
}
