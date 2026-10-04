import { z } from "zod";
import type { Currency } from "@prisma/client";
import { isIntegerCurrency } from "@/lib/money";

// Validação dos parâmetros de URL do redesign do calendário (?month=,
// ?day=) - ano aceito 2000-2100 (requisito explícito), formato estrito
// "YYYY-MM"/"YYYY-MM-DD". Um parâmetro ausente ou inválido devolve `null` -
// quem chama cai para "hoje" nesse caso, nunca quebra a página.
const monthParamSchema = z
  .string()
  .regex(/^(\d{4})-(0[1-9]|1[0-2])$/)
  .refine((v) => {
    const year = Number(v.slice(0, 4));
    return year >= 2000 && year <= 2100;
  });

const dayParamSchema = z
  .string()
  .regex(/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
  .refine((v) => {
    const year = Number(v.slice(0, 4));
    return year >= 2000 && year <= 2100;
  });

export function parseMonthParam(value: unknown): { year: number; month: number } | null {
  if (typeof value !== "string") return null;
  const result = monthParamSchema.safeParse(value);
  if (!result.success) return null;
  const [year, month] = result.data.split("-").map(Number);
  return { year, month };
}

// Devolve a própria string "YYYY-MM-DD" (já é o formato usado como chave em
// toda a Agenda - tokyoDateKey/formatTokyoDateKey) em vez de um Date, para
// quem chama nunca precisar reconstruir o instante a partir de um fuso
// errado.
export function parseDayParam(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const result = dayParamSchema.safeParse(value);
  return result.success ? result.data : null;
}

// Um servico por linha - `position` NUNCA vem do cliente (evita gaps/
// duplicatas mandados pelo frontend); e sempre atribuido pelo backend como o
// indice do item no array (ver createAppointment/updateAppointment em
// mutations.ts).
const appointmentServiceInputSchema = z.object({
  productId: z.string().trim().min(1, "Selecione um serviço."),
});

const appointmentStatusForCreateValues = ["AGENDADO", "CONFIRMADO", "CONCLUIDO", "CANCELADO", "FALTOU"] as const;

// Payload comum de criar/editar (remarcar) - startAt no formato de
// <input type="datetime-local"> ("YYYY-MM-DDTHH:mm"), SEMPRE interpretado
// como horario de Toquio (ver parseTokyoDateTimeInput em time.ts), nunca o
// fuso do navegador/servidor. `allowOverlap` so importa quando o backend ja
// devolveu uma lista de conflitos numa tentativa anterior (aviso, nao
// bloqueio - ver detectOverlap em calculations.ts).
export function appointmentInputSchema() {
  return z.object({
    clientId: z.string().trim().min(1, "Selecione um cliente."),
    startAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Formato de data/hora inválido."),
    services: z.array(appointmentServiceInputSchema).min(1, "Adicione ao menos um serviço."),
    notes: z
      .string()
      .trim()
      .max(500, "A observação pode ter no máximo 500 caracteres.")
      .optional()
      .or(z.literal("")),
    allowOverlap: z.boolean().optional(),
  });
}

export function appointmentStatusChangeSchema() {
  return z.object({
    status: z.enum(appointmentStatusForCreateValues),
    // So relevante ao reabrir (CANCELADO/FALTOU -> AGENDADO), que reaplica a
    // checagem de sobreposicao - ignorado pelas demais transicoes.
    allowOverlap: z.boolean().optional(),
  });
}

// Item final de "concluir atendimento" - quantidade SEMPRE inteira (>0),
// diferente do item de venda geral (src/lib/sales/schema.ts), que so exige
// inteiro quando a moeda e sem casas decimais: um servico e sempre uma
// unidade discreta, nunca uma quantidade fracionaria (kg/horas), então a
// regra e mais estrita aqui de proposito, nao por acaso.
function completeItemSchema(currency: Currency | null) {
  return z.object({
    productId: z.string().trim().optional().or(z.literal("")),
    description: z.string().trim().min(1, "Digite a descrição do item."),
    quantity: z.coerce.number().int("A quantidade deve ser um número inteiro.").positive("A quantidade precisa ser maior que zero."),
    unitPrice: z.coerce
      .number()
      .nonnegative("O preço unitário não pode ser negativo.")
      .refine(
        (n) => !currency || !isIntegerCurrency(currency) || Number.isInteger(n),
        "Valores em iene não têm casas decimais."
      ),
  });
}

// Mesmo formato de parcela que Sales ja usa (dueDate/amount/paidNow) -
// reaproveitado, nao reinventado (ver instrucao explicita do prompt da
// Etapa 8: "reaproveite o schema/validação existente, não invente opções
// novas"). `dueDate` de uma parcela paidNow=true e ignorado pelo backend
// (completeAppointment sempre usa o saleDate do proprio atendimento nesse
// caso - ver resolveSaleDateFromAppointment em calculations.ts), mas o
// campo continua obrigatorio no schema pra manter o mesmo formato de
// instalments em toda a base.
function completeInstallmentSchema(currency: Currency | null) {
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

// Schema de "concluir atendimento" (Etapa 8, incremento 3). categoryId e
// SEMPRE exigido (decisao aprovada: usuario escolhe no modal, mesmo seletor
// REVENUE do formulario de venda - createSale/assertCategoryMatches
// revalidam de qualquer forma, isso aqui e so a forma do payload). O backend
// SEMPRE recalcula os totais a partir de items/installments - nunca confia
// em nenhum total computado no frontend.
export function appointmentCompleteSchema(currency: Currency | null) {
  return z
    .object({
      categoryId: z.string().trim().min(1, "Selecione uma categoria de receita."),
      items: z.array(completeItemSchema(currency)).min(1, "Adicione ao menos um item."),
      paymentMethod: z.string().trim().optional().or(z.literal("")),
      installments: z.array(completeInstallmentSchema(currency)).min(1, "Informe ao menos uma parcela."),
    })
    .superRefine((data, ctx) => {
      // Mesma restricao que o formulario de venda ja impoe estruturalmente
      // (SaleForm so envia paidNow=true quando ha EXATAMENTE 1 parcela e o
      // modo e "a vista") - aqui e validada explicitamente no backend, nao
      // so garantida pela UI, porque o formulario de conclusao da Agenda e
      // um caminho de entrada diferente e o backend nunca deve confiar
      // apenas na UI pra impor essa regra (mesmo principio de "nunca confia
      // em calculo do frontend" ja usado em toda a base).
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
          message: "Pagamento à vista só é permitido com uma única parcela.",
          path: ["installments"],
        });
      }
    });
}
