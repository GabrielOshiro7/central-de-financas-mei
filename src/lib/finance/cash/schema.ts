import { z } from "zod";
import { isIntegerCurrency } from "@/lib/money";
import type { Currency } from "@prisma/client";

// Saldo inicial (Etapa 5.1) - vive no mesmo formulario/lugar de currency
// (secao "Empresa" de Configuracoes), nao no onboarding. Pode ser negativo
// (empresa que comecou endividada) ou zero, entao nao ha refine de
// positividade aqui - so a mesma regra de casas decimais por moeda ja usada
// em transactionSchema/businessEditSchema.
export function openingBalanceSchema(currency: Currency | null) {
  return z.object({
    openingBalance: z.coerce
      .number()
      .refine(
        (n) => !currency || !isIntegerCurrency(currency) || Number.isInteger(n),
        "Valores em iene não têm casas decimais."
      ),
    openingBalanceDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Data inválida."),
  });
}
