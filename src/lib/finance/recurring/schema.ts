import { z } from "zod";
import { isIntegerCurrency } from "@/lib/money";
import type { Currency } from "@prisma/client";

const entryTypeValues = ["REVENUE", "COST", "EXPENSE"] as const;
const frequencyValues = ["WEEKLY", "MONTHLY", "YEARLY"] as const;

// Schema do molde de lancamento recorrente (Etapa 4.1). `currency` so entra
// aqui pra validar a mesma regra "sem casas decimais em JPY" ja usada em
// transactionSchema (finance/schema.ts) - a moeda em si nao e persistida no
// molde (usa sempre a moeda da empresa).
export function recurringEntrySchema(currency: Currency | null) {
  return z
    .object({
      type: z.enum(entryTypeValues),
      categoryId: z.string().trim().min(1, "Selecione uma categoria."),
      description: z.string().trim().min(1, "Digite uma descrição."),
      amount: z.coerce
        .number()
        .positive("O valor precisa ser maior que zero.")
        .refine(
          (n) => !currency || !isIntegerCurrency(currency) || Number.isInteger(n),
          "Valores em iene não têm casas decimais."
        ),
      frequency: z.enum(frequencyValues),
      dayOfWeek: z.coerce.number().int().min(0, "Dia da semana inválido.").max(6, "Dia da semana inválido.").optional(),
      dayOfMonth: z.coerce.number().int().min(1, "Dia do mês inválido.").max(31, "Dia do mês inválido.").optional(),
      yearMonth: z.coerce.number().int().min(0, "Mês inválido.").max(11, "Mês inválido.").optional(),
      startDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Data de início inválida."),
      endDate: z
        .string()
        .refine((v) => !Number.isNaN(Date.parse(v)), "Data de fim inválida.")
        .optional()
        .or(z.literal("")),
    })
    // So o(s) campo(s) relevante(s) pra frequencia escolhida pode(m) vir
    // preenchido(s) - os demais precisam ficar ausentes (secao "MODELO DE
    // DADOS" da Etapa 4.1: "os outros ficam null").
    .superRefine((data, ctx) => {
      if (data.frequency === "WEEKLY") {
        if (data.dayOfWeek === undefined) {
          ctx.addIssue({ code: "custom", message: "Selecione o dia da semana.", path: ["dayOfWeek"] });
        }
        if (data.dayOfMonth !== undefined || data.yearMonth !== undefined) {
          ctx.addIssue({
            code: "custom",
            message: "Frequência semanal não usa dia do mês nem mês.",
            path: ["frequency"],
          });
        }
      } else if (data.frequency === "MONTHLY") {
        if (data.dayOfMonth === undefined) {
          ctx.addIssue({ code: "custom", message: "Selecione o dia do mês.", path: ["dayOfMonth"] });
        }
        if (data.dayOfWeek !== undefined || data.yearMonth !== undefined) {
          ctx.addIssue({
            code: "custom",
            message: "Frequência mensal não usa dia da semana nem mês.",
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
