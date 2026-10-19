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

// Selo de status da venda - SEMPRE neutro (cinza), como os selos de status
// da Agenda (src/lib/agenda/options.ts). Status de venda não é um dos 4 usos
// da paleta Musgo/Âmbar/Terracota (KPI, selo de status de pagamento, selo de
// prioridade de insight, linha de gráfico), e ele aparece na mesma linha do
// selo de PAGAMENTO, que usa a paleta - com cor de status aqui, "Confirmada"
// e "Parcialmente paga" ficavam com o mesmo Âmbar lado a lado. Diferenciação
// por texto + borda/peso: rascunho tracejado, confirmada com texto forte,
// concluída preenchida, cancelada apagada (sem cair abaixo de 4.5:1).
// Coberto por tests/unit/sales/options.test.ts.
export const SALE_STATUS_BADGE_STYLE: Record<SaleStatus, string> = {
  DRAFT: "border border-dashed border-gray-400 text-gray-600 dark:border-neutral-600 dark:text-neutral-400",
  CONFIRMED: "border border-gray-400 font-semibold text-gray-900 dark:border-neutral-500 dark:text-neutral-100",
  COMPLETED: "border border-gray-900 bg-gray-100 text-gray-900 dark:border-neutral-100 dark:bg-neutral-800 dark:text-neutral-100",
  CANCELLED: "border border-gray-200 text-gray-500 dark:border-neutral-800 dark:text-neutral-400",
};

export const SALE_DISCOUNT_TYPE_OPTIONS: { value: SaleDiscountType; label: string }[] = [
  { value: "FIXED", label: "Valor fixo" },
  { value: "PERCENTAGE", label: "Percentual" },
];
