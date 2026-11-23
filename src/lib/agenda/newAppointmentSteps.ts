import { isDateKey } from "@/lib/time/zoned";
import { CLIENT_CONTACT_MAX_LENGTH, CLIENT_CONTACT_TOO_LONG } from "@/lib/clients/options";

// Logica pura do popup "Novo agendamento" em passos (NewAppointmentModal): quantos passos ha, o contador, a validacao
// de cada passo e se ja ha dado preenchido (para o "Descartar agendamento?"). Sem React e sem DOM: testavel direto.
// O backend (dayAppointmentInputSchema) continua validando TUDO; isto so antecipa os erros, passo a passo.

export type StepId = "cliente" | "servicos" | "data" | "pagamento";

export const STEP_LABELS: Record<StepId, string> = {
  cliente: "Cliente",
  servicos: "Serviços",
  data: "Data",
  pagamento: "Pagamento",
};

// 3 passos sem valor; 4 com valor (o passo Pagamento so existe quando o total e maior que zero).
export function stepsFor(total: number): StepId[] {
  return total > 0 ? ["cliente", "servicos", "data", "pagamento"] : ["cliente", "servicos", "data"];
}

// "1/3" (index base 0 -> "1/3").
export function counterLabel(index: number, totalSteps: number): string {
  return `${index + 1}/${totalSteps}`;
}

export function counterSpokenLabel(index: number, totalSteps: number): string {
  return `Passo ${index + 1} de ${totalSteps}`;
}

export type DraftRow = { productId: string; quantity: string; unitPrice: string };
export type DraftInstallment = { dueDateInput: string; amount: string };

export type AppointmentDraft = {
  title: string;
  clientId: string;
  whatsapp: string;
  rows: DraftRow[];
  scheduledOn: string;
  notes: string;
  categoryId: string;
  paymentTiming: "AVISTA" | "APRAZO";
  paymentMethod: string;
  installments: DraftInstallment[];
};

// Estado inicial de referencia, para saber o que o usuario ja mexeu.
export type DraftBaseline = { scheduledOn: string; categoryId: string };

// Ha algum dado preenchido (titulo, cliente, servico, data diferente da inicial, observacao ou pagamento mexido)?
// Sem dado, Esc/Cancelar fecham direto; com dado, pedem confirmacao.
export function hasFilledData(draft: AppointmentDraft, baseline: DraftBaseline): boolean {
  return (
    draft.title.trim() !== "" ||
    draft.clientId !== "" ||
    draft.rows.length > 0 ||
    draft.scheduledOn !== baseline.scheduledOn ||
    draft.notes.trim() !== "" ||
    draft.paymentMethod !== "" ||
    draft.paymentTiming !== "AVISTA" ||
    draft.categoryId !== baseline.categoryId ||
    draft.installments.some((i) => i.amount !== "")
  );
}

export type StepError = {
  step: StepId;
  message: string;
  // id do campo com o erro (aria-invalid) - para o foco e o aria-describedby.
  fieldId?: string;
  // Erro "valor sem cliente": a UI mostra o botao "Voltar e escolher cliente".
  needsClient?: boolean;
};

export const ERROR_NEEDS_CLIENT = "Escolha um cliente para agendamentos com valor.";
export const ERROR_AT_LEAST_ONE = "Informe ao menos um título, cliente ou serviço.";

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Formata um valor na moeda (so para a mensagem da soma das parcelas; sem ele a mensagem e a generica).
export type MoneyFormatter = (value: number) => string;

// Valida UM passo (o que o "Proximo" confere). Devolve o primeiro erro ou null.
export function validateStep(step: StepId, draft: AppointmentDraft, total: number, decimals: number, money?: MoneyFormatter): StepError | null {
  switch (step) {
    case "cliente":
      // Tudo opcional aqui (as regras cruzadas dependem dos servicos, passo 2); so o tamanho do WhatsApp e conferido.
      if (draft.whatsapp.trim().length > CLIENT_CONTACT_MAX_LENGTH) {
        return { step, message: CLIENT_CONTACT_TOO_LONG, fieldId: "clientWhatsapp" };
      }
      return null;
    case "servicos": {
      if (draft.rows.some((r) => !r.quantity || Number(r.quantity) < 1 || r.unitPrice === "")) {
        return { step, message: "Preencha quantidade e valor de todos os serviços." };
      }
      if (!draft.clientId && draft.rows.length === 0 && !draft.title.trim()) {
        return { step, message: ERROR_AT_LEAST_ONE };
      }
      if (total > 0 && !draft.clientId) {
        return { step, message: ERROR_NEEDS_CLIENT, needsClient: true };
      }
      return null;
    }
    case "data":
      if (!draft.scheduledOn || !isDateKey(draft.scheduledOn)) {
        return { step, message: "Informe a data do atendimento.", fieldId: "scheduledOn" };
      }
      return null;
    case "pagamento": {
      if (total <= 0) return null;
      if (!draft.categoryId) return { step, message: "Selecione uma categoria de receita.", fieldId: "categoryId" };
      if (draft.paymentTiming === "APRAZO") {
        if (draft.installments.some((i) => !i.dueDateInput || !i.amount)) {
          return { step, message: "Preencha vencimento e valor de todas as parcelas." };
        }
        const sum = roundTo(
          draft.installments.reduce((t, i) => t + (Number(i.amount) || 0), 0),
          decimals
        );
        if (sum !== total) {
          return {
            step,
            message: money
              ? `A soma das parcelas (${money(sum)}) não bate com o total do atendimento (${money(total)}).`
              : "A soma das parcelas não bate com o total do atendimento.",
          };
        }
      }
      return null;
    }
  }
}

// Valida todos os passos existentes, na ordem; o primeiro erro diz em qual passo o usuario deve ficar.
export function validateAllSteps(draft: AppointmentDraft, total: number, decimals: number, money?: MoneyFormatter): StepError | null {
  for (const step of stepsFor(total)) {
    const error = validateStep(step, draft, total, decimals, money);
    if (error) return error;
  }
  return null;
}
