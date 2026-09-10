import type { RecurringBillFrequency } from "@prisma/client";
import type { BillDirection } from "@/lib/finance/bills/status";

export const BILL_DIRECTION_OPTIONS: { value: BillDirection; label: string }[] = [
  { value: "PAYABLE", label: "Contas a pagar" },
  { value: "RECEIVABLE", label: "Contas a receber" },
];

export const BILL_DIRECTION_LABELS: Record<BillDirection, { singular: string; action: string }> = {
  PAYABLE: { singular: "conta a pagar", action: "Marcar como pago" },
  RECEIVABLE: { singular: "conta a receber", action: "Marcar como recebido" },
};

// Reaproveita a mesma numeracao de dia da semana/mes de
// src/lib/finance/recurring/options.ts (0=domingo..6=sabado,
// 0=janeiro..11=dezembro) - nao redefine outra convencao aqui.
export { WEEKDAY_OPTIONS, MONTH_OPTIONS } from "@/lib/finance/recurring/options";

export const RECURRING_BILL_FREQUENCY_OPTIONS: { value: RecurringBillFrequency; label: string }[] = [
  { value: "WEEKLY", label: "Semanal" },
  { value: "BIWEEKLY", label: "Quinzenal" },
  { value: "MONTHLY", label: "Mensal" },
  { value: "QUARTERLY", label: "Trimestral" },
  { value: "SEMIANNUAL", label: "Semestral" },
  { value: "YEARLY", label: "Anual" },
];

// Nao ha cadastro de conta bancaria/metodo de pagamento no sistema hoje
// (Etapa 5, decisao do adendo) - lista fixa e curta em vez de uma nova
// entidade relacional.
export const PAYMENT_METHOD_OPTIONS = [
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "TRANSFERENCIA", label: "Transferência" },
  { value: "CARTAO", label: "Cartão" },
  { value: "BOLETO", label: "Boleto" },
  { value: "OUTRO", label: "Outro" },
];

export const DUE_SOON_OPTIONS: { value: string; label: string; days: number }[] = [
  { value: "TODAY", label: "Vencendo hoje", days: 0 },
  { value: "NEXT_7_DAYS", label: "Próximos 7 dias", days: 7 },
  { value: "NEXT_30_DAYS", label: "Próximos 30 dias", days: 30 },
];
