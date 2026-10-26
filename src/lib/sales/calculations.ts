import { Prisma, type BillStatus, type Currency, type SaleDiscountType } from "@prisma/client";
import { isIntegerCurrency } from "@/lib/money";
import {
  addDays,
  compareKeys,
  startOfDayInstant,
  toDateKey,
  todayKey,
  type BusinessClock,
  type TimeZone,
} from "@/lib/time/zoned";

type Decimal = Prisma.Decimal;
const { Decimal } = Prisma;

function toDecimal(value: Decimal | number | string): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

export type SaleItemInput = {
  quantity: Decimal | number | string;
  unitPrice: Decimal | number | string;
};

export type SaleDiscountInput = { type: SaleDiscountType; value: Decimal | number | string } | null;

export type SaleTotals = {
  itemTotals: Decimal[]; // lineTotal por item, na mesma ordem de `items`
  subtotal: Decimal;
  discountAmount: Decimal;
  total: Decimal;
};

// Pura e sem validacao de regra de negocio (mesmo espirito de
// summarizeEntries) - quem chama (src/lib/sales/mutations.ts) e responsavel
// por rejeitar um total negativo ou um discountValue fora dos limites antes
// de persistir. lineTotal = quantity * unitPrice sempre recalculado aqui,
// nunca confia no valor que o frontend mandou (secao "CALCULOS" do prompt).
export function calculateSaleTotals(items: SaleItemInput[], discount: SaleDiscountInput): SaleTotals {
  const itemTotals = items.map((item) => toDecimal(item.quantity).times(toDecimal(item.unitPrice)));
  const subtotal = itemTotals.reduce((total, amount) => total.plus(amount), new Decimal(0));

  let discountAmount = new Decimal(0);
  if (discount) {
    switch (discount.type) {
      case "PERCENTAGE":
        discountAmount = subtotal.times(toDecimal(discount.value)).dividedBy(100);
        break;
      case "FIXED":
        discountAmount = toDecimal(discount.value);
        break;
      default: {
        const exhaustiveCheck: never = discount.type;
        throw new Error(`Tipo de desconto não tratado: ${exhaustiveCheck}`);
      }
    }
  }

  const total = subtotal.minus(discountAmount);
  return { itemTotals, subtotal, discountAmount, total };
}

export type SalePaymentStatus = "NAO_PAGA" | "PARCIAL" | "PAGA" | "ATRASADA";

// Nunca armazenado em Sale - sempre derivado dos Bills relacionados em tempo
// de leitura (mesmo principio de deriveBillStatus para "atrasado"). Bills
// CANCELLED sao ignorados na derivacao (uma parcela cancelada nao conta nem
// como paga nem como pendente). PARCIAL tem prioridade sobre ATRASADA:
// se ja entrou algum dinheiro, "parcial" e mais informativo pro usuario do
// que "atrasada", mesmo que uma das parcelas restantes esteja vencida.
// "Vencida" = dia de calendario do vencimento antes de "hoje" no fuso da
// empresa (Etapa F3b), mesma regra de deriveBillStatus.
export function deriveSalePaymentStatus(
  bills: { status: BillStatus; dueDate: Date }[],
  clock: BusinessClock
): SalePaymentStatus {
  const active = bills.filter((b) => b.status !== "CANCELLED");
  if (active.length === 0) return "NAO_PAGA";

  const paidCount = active.filter((b) => b.status === "PAID").length;
  if (paidCount === active.length) return "PAGA";
  if (paidCount > 0) return "PARCIAL";

  const today = todayKey(clock);
  const hasOverdue = active.some(
    (b) => b.status === "PENDING" && compareKeys(toDateKey(b.dueDate, clock.timeZone), today) < 0
  );
  return hasOverdue ? "ATRASADA" : "NAO_PAGA";
}

export const SALE_PAYMENT_STATUS_LABELS: Record<SalePaymentStatus, string> = {
  NAO_PAGA: "Não paga",
  PARCIAL: "Parcialmente paga",
  PAGA: "Paga",
  ATRASADA: "Atrasada",
};

export type InstallmentPreview = { dueDate: Date; amount: Decimal };

// Helper de PREVIA para o formulario (o usuario ainda pode ajustar cada
// parcela antes de enviar) - o backend nunca re-deriva a divisao a partir de
// count/intervalo, so valida que a SOMA das parcelas enviadas bate com
// `total` (ver saleSchema). Ultima parcela absorve o resto da divisao
// (nunca uma segunda regra de arredondamento distinta de isIntegerCurrency -
// mesma moeda/precisao de money.ts). Os vencimentos avancam por DIAS DE
// CALENDARIO no fuso dado (00:00 de cada dia), nunca pelo fuso do processo.
export function splitEqualInstallments(
  total: Decimal,
  count: number,
  firstDueDate: Date,
  intervalDays: number,
  currency: Currency,
  timeZone: TimeZone
): InstallmentPreview[] {
  if (count <= 0) return [];

  const decimalPlaces = isIntegerCurrency(currency) ? 0 : 2;
  const base = total.dividedBy(count).toDecimalPlaces(decimalPlaces, Decimal.ROUND_DOWN);
  const amounts = Array.from({ length: count }, () => base);
  const remainder = total.minus(base.times(count));
  amounts[amounts.length - 1] = amounts[amounts.length - 1].plus(remainder);

  return amounts.map((amount, index) => ({
    amount,
    dueDate: startOfDayInstant(addDays(toDateKey(firstDueDate, timeZone), intervalDays * index), timeZone),
  }));
}
