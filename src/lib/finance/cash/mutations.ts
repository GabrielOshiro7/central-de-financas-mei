import { Prisma, type Business } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dbDateOfInstant } from "@/lib/time/zoned";

const { Decimal } = Prisma;

export type OpeningBalanceInput = {
  openingBalance: number | string;
  openingBalanceDate: Date;
};

export type UpdateOpeningBalanceResult =
  | { ok: true; business: Pick<Business, "id"> }
  | { ok: false; error: string };

// Mesmo padrao de updateBusinessProfile (onboarding/businessMutations.ts):
// resolvido por where: { userId }, nunca por um businessId vindo do cliente.
export async function updateOpeningBalance(
  userId: string,
  input: OpeningBalanceInput
): Promise<UpdateOpeningBalanceResult> {
  const existing = await prisma.business.findUnique({ where: { userId } });
  if (!existing) {
    return { ok: false, error: "Empresa não encontrada." };
  }

  const business = await prisma.business.update({
    where: { userId },
    data: {
      openingBalance: new Decimal(input.openingBalance),
      openingBalanceDate: input.openingBalanceDate,
      // Gravacao dupla (F6a-1): mesmo dia, no fuso da empresa.
      openingBalanceOn: dbDateOfInstant(input.openingBalanceDate, existing.timezone),
    },
    select: { id: true },
  });

  return { ok: true, business };
}
