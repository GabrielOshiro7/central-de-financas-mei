import { Prisma, type Business } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { DateKey } from "@/lib/time/zoned";
import { dayColumns } from "@/lib/finance/entryDay";

const { Decimal } = Prisma;

// Dia do saldo inicial (Etapa F6a-2): "openingBalanceOn" (DateKey digitada -
// o caminho da rota) ou, sem dia de origem, "openingBalanceDate" (instante).
export type OpeningBalanceInput = {
  openingBalance: number | string;
} & ({ openingBalanceOn: DateKey; openingBalanceDate?: undefined } | { openingBalanceDate: Date; openingBalanceOn?: undefined });

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

  const day = dayColumns(
    input.openingBalanceOn !== undefined ? { day: input.openingBalanceOn } : { instant: input.openingBalanceDate },
    existing.timezone
  );
  const business = await prisma.business.update({
    where: { userId },
    data: {
      openingBalance: new Decimal(input.openingBalance),
      openingBalanceDate: day.at,
      openingBalanceOn: day.on,
    },
    select: { id: true },
  });

  return { ok: true, business };
}
