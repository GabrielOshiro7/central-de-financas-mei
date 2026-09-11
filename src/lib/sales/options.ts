import type { SaleStatus, SaleDiscountType } from "@prisma/client";

// Reaproveita a mesma lista fixa de metodos de pagamento das Bills (Etapa 5)
// - nao ha cadastro de conta bancaria/metodo de pagamento no sistema, mesmo
// padrao de re-export ja usado em bills/options.ts para WEEKDAY_OPTIONS/
// MONTH_OPTIONS.
export { PAYMENT_METHOD_OPTIONS } from "@/lib/finance/bills/options";

export const SALE_STATUS_OPTIONS: { value: SaleStatus; label: string }[] = [
  { value: "DRAFT", label: "Rascunho" },
  { value: "CONFIRMED", label: "Confirmada" },
  { value: "CANCELLED", label: "Cancelada" },
  { value: "COMPLETED", label: "Concluída" },
];

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  DRAFT: "Rascunho",
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
  COMPLETED: "Concluída",
};

export const SALE_DISCOUNT_TYPE_OPTIONS: { value: SaleDiscountType; label: string }[] = [
  { value: "FIXED", label: "Valor fixo" },
  { value: "PERCENTAGE", label: "Percentual" },
];
