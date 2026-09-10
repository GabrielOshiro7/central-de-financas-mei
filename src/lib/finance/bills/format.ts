import type { RecurringBillFrequency } from "@prisma/client";

const WEEKDAY_LABELS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MONTH_LABELS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export type RecurringBillRuleLike = {
  frequency: RecurringBillFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  yearMonth: number | null;
};

// Texto curto pra exibir a regra de recorrencia numa linha de tabela, mesmo
// espirito de formatFrequencyLabel (recurring/format.ts), estendido pras
// frequencias novas de RecurringBill.
export function formatRecurringBillFrequencyLabel(entry: RecurringBillRuleLike): string {
  switch (entry.frequency) {
    case "WEEKLY":
      return `Semanal, ${WEEKDAY_LABELS[entry.dayOfWeek ?? 0]}`;
    case "BIWEEKLY":
      return `Quinzenal, ${WEEKDAY_LABELS[entry.dayOfWeek ?? 0]}`;
    case "MONTHLY":
      return `Mensal, dia ${entry.dayOfMonth ?? "-"}`;
    case "QUARTERLY":
      return `Trimestral, dia ${entry.dayOfMonth ?? "-"}`;
    case "SEMIANNUAL":
      return `Semestral, dia ${entry.dayOfMonth ?? "-"}`;
    case "YEARLY":
      return `Anual, ${entry.dayOfMonth ?? "-"} de ${MONTH_LABELS[entry.yearMonth ?? 0]}`;
    default: {
      const exhaustiveCheck: never = entry.frequency;
      throw new Error(`Frequência não tratada: ${exhaustiveCheck}`);
    }
  }
}
