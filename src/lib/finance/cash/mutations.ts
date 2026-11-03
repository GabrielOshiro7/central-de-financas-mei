import { Prisma, type Business } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dbDateOfDaySource, type DaySource } from "@/lib/finance/entryDay";

const { Decimal } = Prisma;

// Dia do saldo inicial (Etapa F6a-2): a DateKey digitada (o caminho da rota)
// ou, sem dia de origem, um instante - ver DaySource (entryDay.ts).
export type OpeningBalanceInput = {
  openingBalance: number | string;
  openingBalanceOn: DaySource;
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
      openingBalanceOn: dbDateOfDaySource(input.openingBalanceOn, existing.timezone),
    },
    select: { id: true },
  });

  return { ok: true, business };
}
