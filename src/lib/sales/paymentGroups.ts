import type { Prisma } from "@prisma/client";
import { dateKeyToDbDate, type DateKey } from "@/lib/time/zoned";
import type { SalePaymentStatus } from "@/lib/sales/calculations";

// Grupos do filtro de pagamento da tela de Vendas. Cada grupo e EXATAMENTE um dos
// status que deriveSalePaymentStatus ja calcula (src/lib/sales/calculations.ts) -
// nenhuma regra propria; o teste de equivalencia (tests/integration/sales/
// paymentGroups.test.ts) compara os dois venda a venda:
//   atrasadas          ATRASADA  QUALQUER parcela pendente ja vencida - o atraso tem
//                                prioridade, mesmo com outras parcelas pagas
//   a-vencer           NAO_PAGA  nada pago e nada vencido (inclui venda sem parcelas ativas)
//   parcialmente-pagas PARCIAL   algo pago, algo pendente e NADA vencido
//   pagas              PAGA      todas as parcelas ativas pagas
// Parcela CANCELLED nunca conta. Rascunho e venda cancelada nao tem situacao de
// pagamento: ficam fora de todos os grupos (so aparecem em "Todas").
export const SALE_PAYMENT_GROUPS = ["atrasadas", "a-vencer", "parcialmente-pagas", "pagas"] as const;
export type SalePaymentGroup = (typeof SALE_PAYMENT_GROUPS)[number];

export const SALE_PAYMENT_GROUP_STATUS: Record<SalePaymentGroup, SalePaymentStatus> = {
  atrasadas: "ATRASADA",
  "a-vencer": "NAO_PAGA",
  "parcialmente-pagas": "PARCIAL",
  pagas: "PAGA",
};

export const SALE_PAYMENT_GROUP_LABELS: Record<SalePaymentGroup, string> = {
  atrasadas: "Atrasadas",
  "a-vencer": "A vencer",
  "parcialmente-pagas": "Parcialmente pagas",
  pagas: "Pagas",
};

// Mensagem do estado vazio de cada grupo.
export const SALE_PAYMENT_GROUP_EMPTY: Record<SalePaymentGroup, string> = {
  atrasadas: "Nenhuma venda atrasada no período.",
  "a-vencer": "Nenhuma venda a vencer no período.",
  "parcialmente-pagas": "Nenhuma venda parcialmente paga no período.",
  pagas: "Nenhuma venda paga no período.",
};

// Valor antigo do parametro de URL ("Em aberto" virou "A vencer"): a pagina
// redireciona para o novo.
export const LEGACY_PAYMENT_GROUP_PARAM = { "em-aberto": "a-vencer" } as const;

export function parseSalePaymentGroup(value: string | undefined): SalePaymentGroup | undefined {
  return SALE_PAYMENT_GROUPS.find((group) => group === value);
}

// So vendas confirmadas/concluidas tem situacao de pagamento.
const PAYABLE_SALE_STATUSES: Prisma.SaleWhereInput = { status: { in: ["CONFIRMED", "COMPLETED"] } };

// Condicao sobre as PARCELAS (bills: status e dueOn) de cada grupo. `today` e o
// "hoje" da empresa (todayKey do relogio dela); vencida = dueOn antes dele - a
// mesma regra de deriveSalePaymentStatus.
export function salePaymentGroupWhere(group: SalePaymentGroup, today: DateKey): Prisma.SaleWhereInput {
  const overdueBill: Prisma.BillWhereInput = { status: "PENDING", dueOn: { lt: dateKeyToDbDate(today) } };
  switch (group) {
    case "atrasadas":
      return { ...PAYABLE_SALE_STATUSES, bills: { some: overdueBill } };
    case "pagas":
      return { ...PAYABLE_SALE_STATUSES, bills: { some: { status: "PAID" }, none: { status: "PENDING" } } };
    case "parcialmente-pagas":
      return {
        ...PAYABLE_SALE_STATUSES,
        AND: [{ bills: { some: { status: "PAID" } } }, { bills: { some: { status: "PENDING" } } }, { bills: { none: overdueBill } }],
      };
    case "a-vencer":
      return { ...PAYABLE_SALE_STATUSES, bills: { none: { OR: [{ status: "PAID" }, overdueBill] } } };
    default: {
      const exhaustiveCheck: never = group;
      throw new Error(`Grupo de pagamento nao tratado: ${exhaustiveCheck}`);
    }
  }
}
