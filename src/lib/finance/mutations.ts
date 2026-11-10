import { Prisma, type EntrySource, type FinancialEntryType, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getBusinessTimeZone } from "@/lib/time/businessClock";
import { dbDateOfDaySource, type DaySource } from "@/lib/finance/entryDay";

const { Decimal } = Prisma;

// Aceita o client global (prisma) OU um tx de transacao interativa - usado
// por completeAppointment (Etapa 8) pra rodar essa checagem DENTRO da mesma
// transacao que cria a Sale. Default preserva o comportamento de todo
// chamador existente.
type Db = PrismaClient | Prisma.TransactionClient;

// Dia do lancamento (Etapa F6a-2): a DateKey digitada pelo usuario (o
// caminho das rotas) ou, so quando nao ha dia de origem, um instante - ver
// DaySource (entryDay.ts).
export type TransactionInput = {
  type: FinancialEntryType;
  description: string;
  categoryId: string;
  amount: number | string;
  notes?: string | null;
  occurredOn: DaySource;
};

// `code` distingue recusas que a rota traduz em outro status HTTP (hoje so
// BILL_ENTRY_LOCKED -> 409); sem `code`, vale o mapeamento antigo da rota.
export type MutationResult<T> = { ok: true; value: T } | { ok: false; error: string; code?: "BILL_ENTRY_LOCKED" };

export const BILL_ENTRY_LOCKED_MESSAGE =
  "Este lançamento foi gerado pelo pagamento de uma conta. Para alterá-lo, reverta o pagamento na conta.";

// Lancamento gerado pelo pagamento de uma conta (source BILL E vinculado a uma
// Bill): somente leitura em Lancamentos - a alteracao e feita pela conta
// (Reverter pagamento, que apaga o lancamento). BILL SEM conta (billId nulo -
// artefatos antigos) segue editavel/excluivel como antes. Os fluxos internos
// legitimos (reverter, desfazer atendimento, cancelar venda) nao passam por
// updateTransaction/deleteTransaction: apagam via reverseBillSettlementTx.
export function isBillLinkedEntry(entry: { source: EntrySource; billId: string | null }): boolean {
  return entry.source === "BILL" && entry.billId !== null;
}

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

  const occurredOn = dbDateOfDaySource(input.occurredOn, await getBusinessTimeZone(businessId));
  const entry = await prisma.financialEntry.create({
    data: {
      businessId,
      userId,
      type: input.type,
      categoryId: input.categoryId,
      description: input.description,
      amount: new Decimal(input.amount),
      occurredOn,
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
  if (isBillLinkedEntry(existing)) return { ok: false, error: BILL_ENTRY_LOCKED_MESSAGE, code: "BILL_ENTRY_LOCKED" };

  const categoryError = await assertCategoryMatches(businessId, input.categoryId, input.type);
  if (categoryError) return { ok: false, error: categoryError };

  const occurredOn = dbDateOfDaySource(input.occurredOn, await getBusinessTimeZone(businessId));
  await prisma.financialEntry.update({
    where: { id },
    data: {
      type: input.type,
      categoryId: input.categoryId,
      description: input.description,
      amount: new Decimal(input.amount),
      occurredOn,
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
  if (isBillLinkedEntry(existing)) return { ok: false, error: BILL_ENTRY_LOCKED_MESSAGE, code: "BILL_ENTRY_LOCKED" };

  await prisma.financialEntry.delete({ where: { id } });
  return { ok: true, value: { id } };
}
