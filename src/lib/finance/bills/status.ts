import type { BillStatus, FinancialEntryType } from "@prisma/client";
import { compareKeys, toDateKey, todayKey, type BusinessClock } from "@/lib/time/zoned";

// Direcao de uma Bill: nunca armazenada - sempre derivada de category.type,
// o mesmo discriminador que FinancialEntry/RecurringEntry ja usam (Etapa 5,
// ADENDO "Regras obrigatorias para a integracao conta -> lancamento
// financeiro", item 1). REVENUE = a receber, COST/EXPENSE = a pagar.
export type BillDirection = "PAYABLE" | "RECEIVABLE";

export function billDirectionForType(type: FinancialEntryType): BillDirection {
  switch (type) {
    case "REVENUE":
      return "RECEIVABLE";
    case "COST":
    case "EXPENSE":
      return "PAYABLE";
    default: {
      const exhaustiveCheck: never = type;
      throw new Error(`Tipo não tratado: ${exhaustiveCheck}`);
    }
  }
}

// Status exibido ao usuario - "OVERDUE" (Atrasado) NUNCA e persistido no
// banco (BillStatus so tem PENDING/PAID/CANCELLED): e sempre derivado aqui a
// partir de status + dueDate. "Hoje" e o vencimento sao DIAS DE CALENDARIO no
// fuso da EMPRESA (Etapa F3b, src/lib/time/zoned.ts) - a mesma nocao de "hoje"
// de period.ts, nunca o fuso do processo Node. Vence hoje = PENDING; venceu
// ontem ou antes = OVERDUE.
export type BillDisplayStatus = "PENDING" | "OVERDUE" | "PAID" | "CANCELLED";

export function deriveBillStatus(bill: { status: BillStatus; dueDate: Date }, clock: BusinessClock): BillDisplayStatus {
  switch (bill.status) {
    case "PENDING":
      return compareKeys(toDateKey(bill.dueDate, clock.timeZone), todayKey(clock)) < 0 ? "OVERDUE" : "PENDING";
    case "PAID":
      return "PAID";
    case "CANCELLED":
      return "CANCELLED";
    default: {
      const exhaustiveCheck: never = bill.status;
      throw new Error(`Status não tratado: ${exhaustiveCheck}`);
    }
  }
}

export const BILL_DISPLAY_STATUS_LABELS: Record<BillDirection, Record<BillDisplayStatus, string>> = {
  PAYABLE: {
    PENDING: "Pendente",
    OVERDUE: "Atrasado",
    PAID: "Pago",
    CANCELLED: "Cancelado",
  },
  RECEIVABLE: {
    PENDING: "Pendente",
    OVERDUE: "Atrasado",
    PAID: "Recebido",
    CANCELLED: "Cancelado",
  },
};

export function billStatusLabel(direction: BillDirection, displayStatus: BillDisplayStatus): string {
  return BILL_DISPLAY_STATUS_LABELS[direction][displayStatus];
}
