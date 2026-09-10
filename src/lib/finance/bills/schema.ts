import { z } from "zod";
import { isIntegerCurrency } from "@/lib/money";
import type { Currency } from "@prisma/client";

const recurringBillFrequencyValues = [
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "YEARLY",
] as const;

const directionValues = ["PAYABLE", "RECEIVABLE"] as const;

// Schema de criacao/edicao de uma Bill avulsa (nao recorrente). categoryId
// so e checado quanto a formato aqui - a checagem "existe, esta ativa, e
// compativel com a direcao" e responsabilidade de assertCategoryMatchesDirection
// no backend (nunca so no formulario, ver mutations.ts).
export function billSchema(currency: Currency | null) {
  return z.object({
    direction: z.enum(directionValues),
    categoryId: z.string().trim().min(1, "Selecione uma categoria."),
    description: z.string().trim().min(1, "Digite uma descrição."),
    amount: z.coerce
      .number()
      .positive("O valor precisa ser maior que zero.")
      .refine(
        (n) => !currency || !isIntegerCurrency(currency) || Number.isInteger(n),
        "Valores em iene não têm casas decimais."
      ),
    issueDate: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), "Data de emissão inválida.")
      .optional()
      .or(z.literal("")),
    dueDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Data de vencimento inválida."),
    documentNumber: z.string().trim().optional(),
    counterpartyName: z.string().trim().optional(),
    paymentMethod: z.string().trim().optional(),
    bankAccount: z.string().trim().optional(),
    costCenter: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  });
}

// Schema do molde de conta recorrente (RecurringBill). Mesma logica de
// "so o campo relevante pra frequencia pode vir preenchido" ja usada em
// recurringEntrySchema (recurring/schema.ts) - so estendida para as
// frequencias novas (BIWEEKLY usa dayOfWeek como WEEKLY; QUARTERLY/
// SEMIANNUAL usam dayOfMonth como MONTHLY).
export function recurringBillSchema(currency: Currency | null) {
  return z
    .object({
      direction: z.enum(directionValues),
      categoryId: z.string().trim().min(1, "Selecione uma categoria."),
      description: z.string().trim().min(1, "Digite uma descrição."),
      amount: z.coerce
        .number()
        .positive("O valor precisa ser maior que zero.")
        .refine(
          (n) => !currency || !isIntegerCurrency(currency) || Number.isInteger(n),
          "Valores em iene não têm casas decimais."
        ),
      frequency: z.enum(recurringBillFrequencyValues),
      dayOfWeek: z.coerce.number().int().min(0, "Dia da semana inválido.").max(6, "Dia da semana inválido.").optional(),
      dayOfMonth: z.coerce.number().int().min(1, "Dia do mês inválido.").max(31, "Dia do mês inválido.").optional(),
      yearMonth: z.coerce.number().int().min(0, "Mês inválido.").max(11, "Mês inválido.").optional(),
      startDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Data de início inválida."),
      endDate: z
        .string()
        .refine((v) => !Number.isNaN(Date.parse(v)), "Data de fim inválida.")
        .optional()
        .or(z.literal("")),
      documentNumber: z.string().trim().optional(),
      counterpartyName: z.string().trim().optional(),
      paymentMethod: z.string().trim().optional(),
      bankAccount: z.string().trim().optional(),
      costCenter: z.string().trim().optional(),
      notes: z.string().trim().optional(),
    })
    .superRefine((data, ctx) => {
      const usesWeekday = data.frequency === "WEEKLY" || data.frequency === "BIWEEKLY";
      const usesMonthday =
        data.frequency === "MONTHLY" || data.frequency === "QUARTERLY" || data.frequency === "SEMIANNUAL";

      if (usesWeekday) {
        if (data.dayOfWeek === undefined) {
          ctx.addIssue({ code: "custom", message: "Selecione o dia da semana.", path: ["dayOfWeek"] });
        }
        if (data.dayOfMonth !== undefined || data.yearMonth !== undefined) {
          ctx.addIssue({
            code: "custom",
            message: "Essa frequência não usa dia do mês nem mês.",
            path: ["frequency"],
          });
        }
      } else if (usesMonthday) {
        if (data.dayOfMonth === undefined) {
          ctx.addIssue({ code: "custom", message: "Selecione o dia do mês.", path: ["dayOfMonth"] });
        }
        if (data.dayOfWeek !== undefined || data.yearMonth !== undefined) {
          ctx.addIssue({
            code: "custom",
            message: "Essa frequência não usa dia da semana nem mês.",
            path: ["frequency"],
          });
        }
      } else if (data.frequency === "YEARLY") {
        if (data.yearMonth === undefined || data.dayOfMonth === undefined) {
          ctx.addIssue({ code: "custom", message: "Selecione o mês e o dia.", path: ["yearMonth"] });
        }
        if (data.dayOfWeek !== undefined) {
          ctx.addIssue({ code: "custom", message: "Frequência anual não usa dia da semana.", path: ["dayOfWeek"] });
        }
      }

      if (data.endDate && Date.parse(data.endDate) < Date.parse(data.startDate)) {
        ctx.addIssue({
          code: "custom",
          message: "A data de fim não pode ser anterior à data de início.",
          path: ["endDate"],
        });
      }
    });
}
