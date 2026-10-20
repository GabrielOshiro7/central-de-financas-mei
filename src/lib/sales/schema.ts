import { z } from "zod";
import { isIntegerCurrency } from "@/lib/money";
import type { Currency } from "@prisma/client";

const discountTypeValues = ["FIXED", "PERCENTAGE"] as const;
const createStatusValues = ["DRAFT", "CONFIRMED"] as const;

function saleItemSchema(currency: Currency | null) {
  return z.object({
    productId: z.string().trim().optional().or(z.literal("")),
    description: z.string().trim().min(1, "Digite a descrição do item."),
    quantity: z.coerce
      .number()
      .positive("A quantidade precisa ser maior que zero.")
      .refine(
        (n) => !currency || !isIntegerCurrency(currency) || Number.isInteger(n),
        "Quantidade deve ser um número inteiro nesta moeda."
      ),
    unitPrice: z.coerce
      .number()
      .nonnegative("O preço unitário não pode ser negativo.")
      .refine(
        (n) => !currency || !isIntegerCurrency(currency) || Number.isInteger(n),
        "Valores em iene não têm casas decimais."
      ),
  });
}

// Parcelas sao SEMPRE pares explicitos {dueDate, amount} enviados pelo
// cliente (a divisao igual e so uma previa client-side, ver
// splitEqualInstallments) - o backend nunca re-deriva a divisao, so valida
// que a soma bate com o total (ver createSale/confirmSale em mutations.ts).
// `paidNow` so faz sentido quando ha exatamente UMA parcela: marca a venda
// como a vista (Bill criada ja PAID) em vez de a prazo (Bill PENDING).
function installmentSchema(currency: Currency | null) {
  return z.object({
    dueDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Data de vencimento inválida."),
    amount: z.coerce
      .number()
      .positive("O valor da parcela precisa ser maior que zero.")
      .refine(
        (n) => !currency || !isIntegerCurrency(currency) || Number.isInteger(n),
        "Valores em iene não têm casas decimais."
      ),
    paidNow: z.boolean().optional(),
  });
}

// Mesma restricao que src/lib/agenda/schema.ts ja impoe na conclusao de
// atendimento: `paidNow` (venda a vista, Bill criada ja PAID) so vale com
// EXATAMENTE uma parcela. Sem isto, createSale/confirmSale ignoravam o
// pedido em silencio (generateSaleBills so honra paidNow com 1 parcela) e
// todas as parcelas nasciam pendentes sem avisar quem chamou. SaleForm e
// SaleDetailActions ja so enviam paidNow nesse caso - a regra fica tambem no
// backend porque ele nunca deve confiar apenas na UI.
function paidNowRefinement(
  data: { installments?: { paidNow?: boolean }[] },
  ctx: z.RefinementCtx
) {
  if (!data.installments) return;
  const paidNowCount = data.installments.filter((installment) => installment.paidNow).length;

  if (paidNowCount > 1) {
    ctx.addIssue({
      code: "custom",
      message: "Apenas uma parcela pode ser marcada como paga agora.",
      path: ["installments"],
    });
    return;
  }

  if (paidNowCount === 1 && data.installments.length !== 1) {
    ctx.addIssue({
      code: "custom",
      message: "Venda à vista (paga agora) só é permitida com uma única parcela.",
      path: ["installments"],
    });
  }
}

function discountRefinement(currency: Currency | null) {
  return (
    data: { discountType?: "FIXED" | "PERCENTAGE"; discountValue?: number },
    ctx: z.RefinementCtx
  ) => {
    if (data.discountType && data.discountValue === undefined) {
      ctx.addIssue({ code: "custom", message: "Informe o valor do desconto.", path: ["discountValue"] });
      return;
    }
    if (data.discountType === "PERCENTAGE" && data.discountValue !== undefined) {
      if (data.discountValue < 0 || data.discountValue > 100) {
        ctx.addIssue({ code: "custom", message: "Desconto percentual deve estar entre 0 e 100.", path: ["discountValue"] });
      }
    }
    if (data.discountType === "FIXED" && data.discountValue !== undefined) {
      if (data.discountValue < 0) {
        ctx.addIssue({ code: "custom", message: "O desconto não pode ser negativo.", path: ["discountValue"] });
      }
      if (currency && isIntegerCurrency(currency) && !Number.isInteger(data.discountValue)) {
        ctx.addIssue({ code: "custom", message: "Valores em iene não têm casas decimais.", path: ["discountValue"] });
      }
    }
  };
}

// Schema de criacao de venda. `installments`/`paymentMethod` so sao
// obrigatorios quando status=CONFIRMED - um rascunho (DRAFT) nao gera Bill
// nenhuma, entao o plano de pagamento pode ficar em aberto ate a confirmacao
// (ver confirmSaleSchema/confirmSale). categoryId/clientId so sao checados
// quanto ao formato aqui - existencia/pertencimento a empresa e
// responsabilidade de assertClientBelongsToBusiness/assertCategoryMatches no
// backend (nunca so no formulario).
export function saleSchema(currency: Currency | null) {
  return z
    .object({
      clientRequestId: z.string().trim().min(1, "clientRequestId é obrigatório."),
      status: z.enum(createStatusValues).default("CONFIRMED"),
      clientId: z.string().trim().min(1, "Selecione um cliente."),
      categoryId: z.string().trim().min(1, "Selecione uma categoria."),
      saleDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Data da venda inválida."),
      items: z.array(saleItemSchema(currency)).min(1, "Adicione ao menos um item."),
      discountType: z.enum(discountTypeValues).optional(),
      discountValue: z.coerce.number().optional(),
      paymentMethod: z.string().trim().optional().or(z.literal("")),
      installments: z.array(installmentSchema(currency)).optional(),
      notes: z.string().trim().optional().or(z.literal("")),
    })
    .superRefine((data, ctx) => {
      discountRefinement(currency)(data, ctx);
      if (data.status === "CONFIRMED" && (!data.installments || data.installments.length === 0)) {
        ctx.addIssue({ code: "custom", message: "Informe ao menos uma parcela para confirmar a venda.", path: ["installments"] });
      }
      paidNowRefinement(data, ctx);
    });
}

// Schema do payload de "Confirmar venda" (DRAFT -> CONFIRMED), que so entao
// materializa os Bills (ver confirmSale em mutations.ts) - a venda em si
// (itens/cliente/categoria) ja existe e nao muda aqui.
export function confirmSaleSchema(currency: Currency | null) {
  return z
    .object({
      installments: z.array(installmentSchema(currency)).min(1, "Informe ao menos uma parcela."),
      paymentMethod: z.string().trim().optional().or(z.literal("")),
    })
    .superRefine(paidNowRefinement);
}

// Schema de edicao completa - so aceito pelo backend enquanto a venda nao
// tiver nenhum Bill PAID (ver updateSale em mutations.ts). `installments` e
// opcional: so e obrigatorio fornecer um novo conjunto se o total recalculado
// mudou em relacao ao total armazenado (o mutations.ts valida isso).
export function saleUpdateSchema(currency: Currency | null) {
  return z
    .object({
      clientId: z.string().trim().min(1, "Selecione um cliente."),
      categoryId: z.string().trim().min(1, "Selecione uma categoria."),
      saleDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Data da venda inválida."),
      items: z.array(saleItemSchema(currency)).min(1, "Adicione ao menos um item."),
      discountType: z.enum(discountTypeValues).optional(),
      discountValue: z.coerce.number().optional(),
      paymentMethod: z.string().trim().optional().or(z.literal("")),
      installments: z.array(installmentSchema(currency)).optional(),
      notes: z.string().trim().optional().or(z.literal("")),
    })
    .superRefine(discountRefinement(currency));
}

// Schema do caminho "so notas" quando a venda ja tem alguma parcela PAID
// (ADENDO item 2: nunca alterar retroativamente valor/itens de uma venda com
// pagamento ja registrado).
export const saleNotesUpdateSchema = z.object({
  notes: z.string().trim().optional().or(z.literal("")),
});
