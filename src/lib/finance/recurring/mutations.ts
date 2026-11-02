import { Prisma, type FinancialEntryType, type RecurrenceFrequency } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertCategoryMatches } from "@/lib/finance/mutations";
import { dayColumns } from "@/lib/finance/entryDay";
import { getBusinessTimeZone } from "@/lib/time/businessClock";
import type { DateKey, TimeZone } from "@/lib/time/zoned";

const { Decimal } = Prisma;

export type RecurringEntryInput = {
  type: FinancialEntryType;
  categoryId: string;
  description: string;
  amount: number | string;
  frequency: RecurrenceFrequency;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  yearMonth?: number | null;
  // Dias de inicio/fim (Etapa F6c): startOn/endOn sao a fonte da verdade;
  // startDate/endDate = 00:00 do mesmo dia no fuso da empresa (ate a F6d).
  startOn: DateKey;
  endOn?: DateKey | null;
};

export type MutationResult<T> = { ok: true; value: T } | { ok: false; error: string };

// So o campo relevante pra frequencia e persistido - os demais viram null,
// mesmo que o chamador (ex.: um cliente mal-intencionado direto na API)
// tenha enviado algo neles. A validacao de "so o campo certo veio
// preenchido" ja aconteceu no Zod (recurringEntrySchema); aqui e so a
// projecao final pro banco.
function fieldsForFrequency(input: RecurringEntryInput) {
  switch (input.frequency) {
    case "WEEKLY":
      return { dayOfWeek: input.dayOfWeek ?? null, dayOfMonth: null, yearMonth: null };
    case "MONTHLY":
      return { dayOfWeek: null, dayOfMonth: input.dayOfMonth ?? null, yearMonth: null };
    case "YEARLY":
      return { dayOfWeek: null, dayOfMonth: input.dayOfMonth ?? null, yearMonth: input.yearMonth ?? null };
    default: {
      const exhaustiveCheck: never = input.frequency;
      throw new Error(`Frequência não tratada: ${exhaustiveCheck}`);
    }
  }
}

function recurringDayColumns(input: RecurringEntryInput, timeZone: TimeZone) {
  const start = dayColumns({ day: input.startOn }, timeZone);
  const end = input.endOn ? dayColumns({ day: input.endOn }, timeZone) : null;
  return { startOn: start.on, startDate: start.at, endOn: end?.on ?? null, endDate: end?.at ?? null };
}

export async function createRecurringEntry(
  businessId: string,
  input: RecurringEntryInput
): Promise<MutationResult<{ id: string }>> {
  const categoryError = await assertCategoryMatches(businessId, input.categoryId, input.type);
  if (categoryError) return { ok: false, error: categoryError };

  const entry = await prisma.recurringEntry.create({
    data: {
      businessId,
      type: input.type,
      categoryId: input.categoryId,
      description: input.description,
      amount: new Decimal(input.amount),
      frequency: input.frequency,
      ...fieldsForFrequency(input),
      ...recurringDayColumns(input, await getBusinessTimeZone(businessId)),
    },
    select: { id: true },
  });

  return { ok: true, value: entry };
}

// Escopado por businessId (secao 27, mesmo padrao de updateTransaction).
// Editar o molde NUNCA altera ocorrencias ja materializadas - elas sao
// FinancialEntry independentes, so as ocorrencias FUTURAS (que ainda vao ser
// materializadas) usam os valores novos.
export async function updateRecurringEntry(
  businessId: string,
  id: string,
  input: RecurringEntryInput
): Promise<MutationResult<{ id: string }>> {
  const existing = await prisma.recurringEntry.findFirst({ where: { id, businessId } });
  if (!existing) return { ok: false, error: "Recorrência não encontrada." };

  const categoryError = await assertCategoryMatches(businessId, input.categoryId, input.type);
  if (categoryError) return { ok: false, error: categoryError };

  await prisma.recurringEntry.update({
    where: { id },
    data: {
      type: input.type,
      categoryId: input.categoryId,
      description: input.description,
      amount: new Decimal(input.amount),
      frequency: input.frequency,
      ...fieldsForFrequency(input),
      ...recurringDayColumns(input, await getBusinessTimeZone(businessId)),
    },
  });

  return { ok: true, value: { id } };
}

// Pausar (isActive=false): materializeRecurringEntries para de gerar novas
// ocorrencias pra esse molde, mas todo o historico ja gerado permanece
// intocado (sao linhas normais de FinancialEntry).
export async function setRecurringEntryActive(
  businessId: string,
  id: string,
  isActive: boolean
): Promise<MutationResult<{ id: string }>> {
  const existing = await prisma.recurringEntry.findFirst({ where: { id, businessId } });
  if (!existing) return { ok: false, error: "Recorrência não encontrada." };

  await prisma.recurringEntry.update({ where: { id }, data: { isActive } });
  return { ok: true, value: { id } };
}

// Excluir o molde NAO apaga os FinancialEntry ja gerados - a FK
// recurringEntryId tem onDelete: SetNull (ver schema.prisma), entao o
// proprio Postgres desvincula essas linhas automaticamente (viram
// lancamentos avulsos no historico), sem precisar de um passo manual aqui.
export async function deleteRecurringEntry(
  businessId: string,
  id: string
): Promise<MutationResult<{ id: string }>> {
  const existing = await prisma.recurringEntry.findFirst({ where: { id, businessId } });
  if (!existing) return { ok: false, error: "Recorrência não encontrada." };

  await prisma.recurringEntry.delete({ where: { id } });
  return { ok: true, value: { id } };
}

export async function listRecurringEntries(businessId: string) {
  return prisma.recurringEntry.findMany({
    where: { businessId },
    include: { category: { select: { id: true, name: true } } },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });
}
