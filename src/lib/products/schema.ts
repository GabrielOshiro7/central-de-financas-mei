import { z } from "zod";
import { isIntegerCurrency } from "@/lib/money";
import type { Currency } from "@prisma/client";

// Catalogo minimo de produtos/servicos (Etapa 6) - sem estoque. defaultPrice
// e so um valor sugerido no formulario de item de venda, nunca lido de volta
// depois de a venda ser criada (ver SaleItem em schema.prisma).
export function productSchema(currency: Currency | null) {
  return z.object({
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
  });
}
