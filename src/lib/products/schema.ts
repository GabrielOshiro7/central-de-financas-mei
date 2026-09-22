import { z } from "zod";
import { isIntegerCurrency } from "@/lib/money";
import type { Currency } from "@prisma/client";

const productTypeValues = ["PRODUTO", "SERVICO"] as const;

// Catalogo minimo de produtos/servicos (Etapa 6) - sem estoque. defaultPrice
// e so um valor sugerido no formulario de item de venda, nunca lido de volta
// depois de a venda ser criada (ver SaleItem em schema.prisma).
//
// type/durationMinutes (Etapa 8): default PRODUTO preserva o comportamento
// de todo chamador existente (SaleForm nunca envia esses campos). SERVICO
// exige durationMinutes (inteiro, 1-720 min = ate 12h) porque a Agenda usa
// isso pra calcular o fim de um agendamento (ver computeEndAt em
// src/lib/agenda/calculations.ts). Preco de servico e entendido como preco
// COM imposto (総額表示) - so rotulado na UI, sem logica de imposto aqui.
export function productSchema(currency: Currency | null) {
  return z
    .object({
      name: z.string().trim().min(1, "Digite o nome do produto/serviço."),
      description: z.string().trim().optional().or(z.literal("")),
      defaultPrice: z.coerce
        .number()
        .nonnegative("O preço não pode ser negativo.")
        .refine(
          (n) => !currency || !isIntegerCurrency(currency) || Number.isInteger(n),
          "Valores em iene não têm casas decimais."
        )
        .optional(),
      type: z.enum(productTypeValues).default("PRODUTO"),
      durationMinutes: z.coerce
        .number()
        .int("A duração deve ser um número inteiro de minutos.")
        .positive("A duração precisa ser maior que zero.")
        .max(720, "A duração máxima é 720 minutos (12 horas).")
        .optional(),
    })
    .superRefine((data, ctx) => {
      if (data.type === "SERVICO" && data.durationMinutes === undefined) {
        ctx.addIssue({ code: "custom", message: "Informe a duração do serviço.", path: ["durationMinutes"] });
      }
    });
}
