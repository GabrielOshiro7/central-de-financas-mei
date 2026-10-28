import { Prisma, type EntrySource, type FinancialEntryType, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getBusinessTimeZone } from "@/lib/time/businessClock";
import type { DateKey } from "@/lib/time/zoned";
import { dayColumns } from "@/lib/finance/entryDay";

const { Decimal } = Prisma;

// Aceita o client global (prisma) OU um tx de transacao interativa - usado
// por completeAppointment (Etapa 8) pra rodar essa checagem DENTRO da mesma
// transacao que cria a Sale. Default preserva o comportamento de todo
// chamador existente.
type Db = PrismaClient | Prisma.TransactionClient;

// Dia do lancamento (Etapa F6a-2): "occurredOn" (DateKey digitada pelo
// usuario - o caminho das rotas) ou, so quando nao ha dia de origem,
// "occurredAt" (instante). Ver dayColumns (entryDay.ts).
export type TransactionInput = {
  type: FinancialEntryType;
  description: string;
  categoryId: string;
  amount: number | string;
  notes?: string | null;
} & ({ occurredOn: DateKey; occurredAt?: undefined } | { occurredAt: Date; occurredOn?: undefined });

function entryDaySource(input: TransactionInput) {
  return input.occurredOn !== undefined ? { day: input.occurredOn } : { instant: input.occurredAt };
}

export type MutationResult<T> = { ok: true; value: T } | { ok: false; error: string };

// Confere que a categoria escolhida existe, esta ativa, e e visivel para essa
// empresa (padrao do sistema OU propria dela) e bate com o tipo do
// lancamento. Nunca confiamos apenas na validacao do formulario - um cliente
// mal-intencionado poderia enviar o categoryId de outra empresa. Exportada
// (Etapa 4.1) para ser reaproveitada tambem na criacao/edicao de
// RecurringEntry e a cada materializacao - a mesma regra, nao uma copia.
export async function assertCategoryMatches(
  businessId: string,
  categoryId: string,
  type: FinancialEntryType,
  db: Db = prisma
): Promise<string | null> {
  const category = await db.category.findFirst({
    where: { id: categoryId, active: true, OR: [{ businessId: null }, { businessId }] },
  });
  if (!category) return "Categoria não encontrada.";
  if (category.type !== type) return "Categoria não é compatível com o tipo selecionado.";
  return null;
}

export async function createTransaction(
  businessId: string,
  userId: string,
  input: TransactionInput,
  source: EntrySource = "MANUAL"
): Promise<MutationResult<{ id: string }>> {
  const categoryError = await assertCategoryMatches(businessId, input.categoryId, input.type);
  if (categoryError) return { ok: false, error: categoryError };

  // occurredOn e a fonte do dia; occurredAt e derivado dele (Etapa F6a-2).
  const day = dayColumns(entryDaySource(input), await getBusinessTimeZone(businessId));
  const entry = await prisma.financialEntry.create({
    data: {
      businessId,
      userId,
      type: input.type,
      categoryId: input.categoryId,
      description: input.description,
      amount: new Decimal(input.amount),
      occurredAt: day.at,
      occurredOn: day.on,
      notes: input.notes || null,
      source,
    },
    select: { id: true },
  });

  return { ok: true, value: entry };
}

// Escopado por businessId: se o lancamento nao pertencer a essa empresa,
// retorna erro em vez de alterar dados de outra (secao 27).
export async function updateTransaction(
  businessId: string,
  id: string,
  input: TransactionInput
): Promise<MutationResult<{ id: string }>> {
  const existing = await prisma.financialEntry.findFirst({ where: { id, businessId } });
  if (!existing) return { ok: false, error: "Lançamento não encontrado." };

  const categoryError = await assertCategoryMatches(businessId, input.categoryId, input.type);
  if (categoryError) return { ok: false, error: categoryError };

  const day = dayColumns(entryDaySource(input), await getBusinessTimeZone(businessId));
  await prisma.financialEntry.update({
    where: { id },
    data: {
      type: input.type,
      categoryId: input.categoryId,
      description: input.description,
      amount: new Decimal(input.amount),
      occurredAt: day.at,
      occurredOn: day.on,
      notes: input.notes || null,
    },
  });

  return { ok: true, value: { id } };
}

export async function deleteTransaction(
  businessId: string,
  id: string
): Promise<MutationResult<{ id: string }>> {
  const existing = await prisma.financialEntry.findFirst({ where: { id, businessId } });
  if (!existing) return { ok: false, error: "Lançamento não encontrado." };

  await prisma.financialEntry.delete({ where: { id } });
  return { ok: true, value: { id } };
}
