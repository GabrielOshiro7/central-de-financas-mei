import { z } from "zod";
import { isIntegerCurrency } from "@/lib/money";
import type { Currency } from "@prisma/client";

const entryTypeValues = ["REVENUE", "COST", "EXPENSE"] as const;

// Schema base do lancamento manual/edicao. `currency` nao e persistido no
// lancamento (secao 6) - so entra aqui para validar a regra "sem casas
// decimais em JPY" no momento da submissao.
export function transactionSchema(currency: Currency | null) {
  return z.object({
    type: z.enum(entryTypeValues),
    occurredAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Data inválida."),
    description: z.string().trim().min(1, "Digite uma descrição."),
    categoryId: z.string().trim().min(1, "Selecione uma categoria."),
    amount: z.coerce
      .number()
      .positive("O valor precisa ser maior que zero.")
      .refine(
        (n) => !currency || !isIntegerCurrency(currency) || Number.isInteger(n),
        "Valores em iene não têm casas decimais."
      ),
    notes: z.string().trim().optional(),
  });
}

export const categoryCreateSchema = z.object({
  type: z.enum(entryTypeValues),
  name: z.string().trim().min(1, "Digite um nome para a categoria."),
});
