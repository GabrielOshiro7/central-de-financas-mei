import { z } from "zod";
import { isIntegerCurrency } from "@/lib/money";
import type { Currency } from "@prisma/client";

const productTypeValues = ["PRODUTO", "SERVICO"] as const;

// Catalogo minimo de produtos/servicos (Etapa 6) - sem estoque. defaultPrice
// e so um valor sugerido no formulario de item de venda, nunca lido de volta
// depois de a venda ser criada (ver SaleItem em schema.prisma).
//
// type/durationMinutes (Etapa 8): default PRODUTO preserva o comportamento
// de todo chamador existente (SaleForm nunca envia esses campos).
// durationMinutes e opcional para SERVICO desde a Agenda A3 (o fluxo por dia
// nao tem horario nem duracao); quando informada, inteiro de 1 a 720 min (ate
// 12h). So o fluxo antigo com horario (TIMED) usa a duracao, e ele recusa
// servico sem duracao na hora de remarcar (loadServiceProducts em
// agenda/mutations.ts). Preco de servico e entendido como preco COM imposto
// (総額表示) - so rotulado na UI, sem logica de imposto aqui.
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
    });
}
