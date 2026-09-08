import type { RecurrenceFrequency } from "@prisma/client";

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

export type RecurrenceRuleLike = {
  frequency: RecurrenceFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  yearMonth: number | null;
};

// Texto curto pra exibir a regra de recorrencia numa linha de tabela/card,
// ex.: "Mensal, dia 5" / "Semanal, quarta-feira" / "Anual, 15 de junho".
export function formatFrequencyLabel(entry: RecurrenceRuleLike): string {
  switch (entry.frequency) {
    case "WEEKLY":
      return `Semanal, ${WEEKDAY_LABELS[entry.dayOfWeek ?? 0]}`;
    case "MONTHLY":
      return `Mensal, dia ${entry.dayOfMonth ?? "-"}`;
    case "YEARLY":
      return `Anual, ${entry.dayOfMonth ?? "-"} de ${MONTH_LABELS[entry.yearMonth ?? 0]}`;
    default: {
      const exhaustiveCheck: never = entry.frequency;
      throw new Error(`Frequência não tratada: ${exhaustiveCheck}`);
    }
  }
}
