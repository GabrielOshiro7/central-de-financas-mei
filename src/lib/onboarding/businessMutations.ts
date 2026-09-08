import { Prisma, type Business } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { z } from "zod";
import type { businessEditSchema } from "@/lib/onboarding/schema";

const { Decimal } = Prisma;

export type BusinessEditInput = z.infer<typeof businessEditSchema>;

export type UpdateBusinessResult =
  | { ok: true; business: Pick<Business, "id" | "name"> }
  | { ok: false; error: string };

// Logica de negocio por tras de PATCH /api/business, extraida para ser
// testavel sem precisar de sessao/cookies (mesmo padrao de
// src/lib/finance/mutations.ts).
//
// Uma empresa = uma moeda nesta etapa (Etapa 3.1, "Bug 1"): uma vez que ja
// existe algum lancamento financeiro, a moeda fica travada - trocar depois
// misturaria valores em moedas diferentes sob o mesmo total, sem conversao
// cambial (fora de escopo aqui).
export async function updateBusinessProfile(
  userId: string,
  input: BusinessEditInput
): Promise<UpdateBusinessResult> {
  const existing = await prisma.business.findUnique({ where: { userId } });
  if (!existing) {
    return { ok: false, error: "Empresa não encontrada." };
  }

  if (input.currency !== existing.currency) {
    const entryCount = await prisma.financialEntry.count({ where: { businessId: existing.id } });
    if (entryCount > 0) {
      return {
        ok: false,
        error:
          "Não é possível trocar a moeda: esta empresa já tem lançamentos financeiros registrados. Para usar outra moeda, seria necessário zerar o histórico financeiro, o que esta etapa não permite fazer automaticamente.",
      };
    }
  }

  const business = await prisma.business.update({
    where: { userId },
    data: {
      name: input.name,
      yearsInBusiness: input.yearsInBusiness,
      employeeCount: input.employeeCount,
      currency: input.currency,
      averageMonthlyRevenue: new Decimal(input.averageMonthlyRevenue),
    },
    select: { id: true, name: true },
  });

  return { ok: true, business };
}
