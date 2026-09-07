import { Prisma, type EntrySource, type FinancialEntryType } from "@prisma/client";
import { prisma } from "@/lib/db";

const { Decimal } = Prisma;

export type TransactionInput = {
  type: FinancialEntryType;
  occurredAt: Date;
  description: string;
  categoryId: string;
  amount: number | string;
  notes?: string | null;
};

export type MutationResult<T> = { ok: true; value: T } | { ok: false; error: string };

// Confere que a categoria escolhida existe, esta ativa, e e visivel para essa
// empresa (padrao do sistema OU propria dela) e bate com o tipo do
// lancamento. Nunca confiamos apenas na validacao do formulario - um cliente
// mal-intencionado poderia enviar o categoryId de outra empresa.
async function assertCategoryMatches(
  businessId: string,
  categoryId: string,
  type: FinancialEntryType
): Promise<string | null> {
  const category = await prisma.category.findFirst({
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

  const entry = await prisma.financialEntry.create({
    data: {
      businessId,
      userId,
      type: input.type,
      categoryId: input.categoryId,
      description: input.description,
      amount: new Decimal(input.amount),
      occurredAt: input.occurredAt,
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

  await prisma.financialEntry.update({
    where: { id },
    data: {
      type: input.type,
      categoryId: input.categoryId,
      description: input.description,
      amount: new Decimal(input.amount),
      occurredAt: input.occurredAt,
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
