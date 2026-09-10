import type { BillStatus, FinancialEntryType } from "@prisma/client";
import { startOfDay } from "@/lib/finance/period";

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
// partir de status + dueDate, usando a MESMA nocao de "hoje" (fuso local do
// processo Node) ja estabelecida em period.ts - nunca uma segunda logica de
// data com convencao propria (ver ADENDO da Etapa 5, item 3).
export type BillDisplayStatus = "PENDING" | "OVERDUE" | "PAID" | "CANCELLED";

export function deriveBillStatus(
  bill: { status: BillStatus; dueDate: Date },
  now: Date = new Date()
): BillDisplayStatus {
  switch (bill.status) {
    case "PENDING":
      return startOfDay(bill.dueDate).getTime() < startOfDay(now).getTime() ? "OVERDUE" : "PENDING";
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
