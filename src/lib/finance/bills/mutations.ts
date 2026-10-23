import { Prisma, type RecurringBillFrequency } from "@prisma/client";
import { prisma } from "@/lib/db";
import { billDirectionForType, type BillDirection } from "@/lib/finance/bills/status";

const { Decimal } = Prisma;

export type MutationResult<T> = { ok: true; value: T } | { ok: false; error: string };

// Confere que a categoria escolhida existe, esta ativa, e e visivel para
// essa empresa (padrao do sistema OU propria) - igual a assertCategoryMatches
// (finance/mutations.ts), so que a checagem final e "a direcao da categoria
// (billDirectionForType) bate com a direcao da conta" em vez de "o type bate
// exatamente", ja que uma unica direcao (PAYABLE) cobre duas categorias de
// tipo (COST e EXPENSE). Nunca confia so na validacao do formulario.
async function assertCategoryMatchesDirection(
  businessId: string,
  categoryId: string,
  direction: BillDirection
): Promise<string | null> {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, active: true, OR: [{ businessId: null }, { businessId }] },
  });
  if (!category) return "Categoria não encontrada.";
  if (billDirectionForType(category.type) !== direction) {
    return direction === "PAYABLE"
      ? "Categoria não é compatível com contas a pagar."
      : "Categoria não é compatível com contas a receber.";
  }
  return null;
}

export type BillInput = {
  categoryId: string;
  description: string;
  amount: number | string;
  issueDate?: Date | null;
  dueDate: Date;
  documentNumber?: string | null;
  counterpartyName?: string | null;
  paymentMethod?: string | null;
  bankAccount?: string | null;
  costCenter?: string | null;
  notes?: string | null;
};

export async function createBill(
  businessId: string,
  direction: BillDirection,
  input: BillInput
): Promise<MutationResult<{ id: string }>> {
  const categoryError = await assertCategoryMatchesDirection(businessId, input.categoryId, direction);
  if (categoryError) return { ok: false, error: categoryError };

  const bill = await prisma.bill.create({
    data: {
      businessId,
      categoryId: input.categoryId,
      description: input.description,
      amount: new Decimal(input.amount),
      issueDate: input.issueDate ?? null,
      dueDate: input.dueDate,
      documentNumber: input.documentNumber || null,
      counterpartyName: input.counterpartyName || null,
      paymentMethod: input.paymentMethod || null,
      bankAccount: input.bankAccount || null,
      costCenter: input.costCenter || null,
      notes: input.notes || null,
    },
    select: { id: true },
  });

  return { ok: true, value: bill };
}

// Escopado por businessId (nunca confia em id vindo do cliente sem checar a
// empresa). So permite editar enquanto PENDING (secao "EDICAO" da Etapa 5:
// evitar alteracoes incoerentes em contas ja pagas/recebidas) - uma conta
// PAID so pode ser alterada via revertBillSettlement primeiro.
export async function updateBill(
  businessId: string,
  id: string,
  direction: BillDirection,
  input: BillInput
): Promise<MutationResult<{ id: string }>> {
  const existing = await prisma.bill.findFirst({ where: { id, businessId } });
  if (!existing) return { ok: false, error: "Conta não encontrada." };
  if (existing.status !== "PENDING") {
    return { ok: false, error: "Só é possível editar contas pendentes. Reverta o pagamento/recebimento primeiro." };
  }

  const categoryError = await assertCategoryMatchesDirection(businessId, input.categoryId, direction);
  if (categoryError) return { ok: false, error: categoryError };

  await prisma.bill.update({
    where: { id },
    data: {
      categoryId: input.categoryId,
      description: input.description,
      amount: new Decimal(input.amount),
      issueDate: input.issueDate ?? null,
      dueDate: input.dueDate,
      documentNumber: input.documentNumber || null,
      counterpartyName: input.counterpartyName || null,
      paymentMethod: input.paymentMethod || null,
      bankAccount: input.bankAccount || null,
      costCenter: input.costCenter || null,
      notes: input.notes || null,
    },
  });

  return { ok: true, value: { id } };
}

// Preferido a exclusao (secao "EXCLUSAO" da Etapa 5: preservar
// rastreabilidade de dados financeiros). Nao permite cancelar uma conta ja
// paga/recebida - reverta o pagamento antes. Idempotente se ja cancelada.
export async function cancelBill(businessId: string, id: string): Promise<MutationResult<{ id: string }>> {
  const existing = await prisma.bill.findFirst({ where: { id, businessId } });
  if (!existing) return { ok: false, error: "Conta não encontrada." };
  if (existing.status === "PAID") {
    return { ok: false, error: "Não é possível cancelar uma conta já paga/recebida. Reverta o pagamento primeiro." };
  }
  if (existing.status === "CANCELLED") {
    return { ok: true, value: { id } };
  }

  await prisma.bill.update({ where: { id }, data: { status: "CANCELLED" } });
  return { ok: true, value: { id } };
}

export type SettleBillResult =
  | { ok: true; value: { id: string; financialEntryId: string } }
  | { ok: false; error: string };

// "Marcar como pago/recebido" (Etapa 5). Regras obrigatorias do ADENDO:
// - type do lancamento gerado = category.type (nunca assume COST/REVENUE).
// - occurredAt = paidAt (data REAL do pagamento), nunca dueDate.
// - idempotente: no maximo UM FinancialEntry por conta, mesmo com duplo
//   clique ou requisicoes concorrentes.
//
// A idempotencia vem de duas camadas, igual ao padrao ja usado em
// materializeRecurringEntries/findOrCreateCategoryInTx:
// 1) updateMany com WHERE status=PENDING dentro da transacao - sob duas
//    requisicoes concorrentes, o Postgres serializa as duas UPDATEs na mesma
//    linha; so a primeira ve status ainda PENDING (count=1), a segunda (apos
//    a primeira commitar) ve status ja PAID (count=0).
// 2) billId @unique em FinancialEntry como rede de seguranca contra qualquer
//    outra corrida - se o create() ainda assim violar a constraint, releemos
//    o estado em vez de propagar um erro visivel ao usuario.
export async function settleBill(
  businessId: string,
  userId: string,
  id: string,
  paidAt: Date
): Promise<SettleBillResult> {
  const bill = await prisma.bill.findFirst({
    where: { id, businessId },
    include: { category: true, financialEntry: true },
  });
  if (!bill) return { ok: false, error: "Conta não encontrada." };
  if (bill.status === "CANCELLED") return { ok: false, error: "Não é possível confirmar uma conta cancelada." };

  if (bill.status === "PAID") {
    if (bill.financialEntry) return { ok: true, value: { id: bill.id, financialEntryId: bill.financialEntry.id } };
    return { ok: false, error: "Conta já confirmada, mas sem lançamento financeiro associado." };
  }

  try {
    const financialEntry = await prisma.$transaction(async (tx) => {
      const updated = await tx.bill.updateMany({
        where: { id, businessId, status: "PENDING" },
        data: { status: "PAID", paidAt },
      });
      if (updated.count === 0) return null;

      return tx.financialEntry.create({
        data: {
          businessId,
          userId,
          type: bill.category.type,
          categoryId: bill.categoryId,
          description: bill.description,
          amount: bill.amount,
          occurredAt: paidAt,
          source: "BILL",
          billId: bill.id,
        },
        select: { id: true },
      });
    });

    if (financialEntry === null) {
      const current = await prisma.bill.findFirst({ where: { id, businessId }, include: { financialEntry: true } });
      if (current?.status === "PAID" && current.financialEntry) {
        return { ok: true, value: { id, financialEntryId: current.financialEntry.id } };
      }
      return { ok: false, error: "Não foi possível confirmar. Atualize a página e tente novamente." };
    }

    return { ok: true, value: { id, financialEntryId: financialEntry.id } };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const current = await prisma.bill.findFirst({ where: { id, businessId }, include: { financialEntry: true } });
      if (current?.financialEntry) {
        return { ok: true, value: { id, financialEntryId: current.financialEntry.id } };
      }
    }
    throw error;
  }
}

// Reverter para pendente: o pagamento/recebimento nao aconteceu, entao o
// FinancialEntry gerado pela liquidacao e APAGADO na mesma transacao (tudo ou
// nada) - mesmo que o usuario o tenha editado depois. Substitui a regra antiga
// do ADENDO item 5 (desvincular e manter como lancamento avulso), que fazia o
// Caixa/Dashboard contarem dinheiro inexistente e permitia dupla contagem ao
// liquidar de novo. A regra de manter avulsos ao EXCLUIR um RecurringEntry
// continua valendo (ver recurring/mutations.ts) - nao tem relacao com esta.
// So apaga lancamentos source BILL vinculados a ESTA Bill (billId e @unique).
export async function revertBillSettlement(businessId: string, id: string): Promise<MutationResult<{ id: string }>> {
  const bill = await prisma.bill.findFirst({ where: { id, businessId } });
  if (!bill) return { ok: false, error: "Conta não encontrada." };
  if (bill.status !== "PAID") {
    return { ok: false, error: "Só é possível reverter uma conta já confirmada." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.financialEntry.deleteMany({ where: { billId: id, businessId, source: "BILL" } });
    await tx.bill.update({ where: { id }, data: { status: "PENDING", paidAt: null } });
  });

  return { ok: true, value: { id } };
}

export type RecurringBillInput = {
  categoryId: string;
  description: string;
  amount: number | string;
  frequency: RecurringBillFrequency;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  yearMonth?: number | null;
  startDate: Date;
  endDate?: Date | null;
  documentNumber?: string | null;
  counterpartyName?: string | null;
  paymentMethod?: string | null;
  bankAccount?: string | null;
  costCenter?: string | null;
  notes?: string | null;
};

// So o campo relevante pra frequencia e persistido - mesmo padrao de
// fieldsForFrequency em recurring/mutations.ts, estendido pras frequencias
// novas (BIWEEKLY usa dayOfWeek como WEEKLY; QUARTERLY/SEMIANNUAL usam
// dayOfMonth como MONTHLY).
function fieldsForFrequency(input: RecurringBillInput) {
  switch (input.frequency) {
    case "WEEKLY":
    case "BIWEEKLY":
      return { dayOfWeek: input.dayOfWeek ?? null, dayOfMonth: null, yearMonth: null };
    case "MONTHLY":
    case "QUARTERLY":
    case "SEMIANNUAL":
      return { dayOfWeek: null, dayOfMonth: input.dayOfMonth ?? null, yearMonth: null };
    case "YEARLY":
      return { dayOfWeek: null, dayOfMonth: input.dayOfMonth ?? null, yearMonth: input.yearMonth ?? null };
    default: {
      const exhaustiveCheck: never = input.frequency;
      throw new Error(`Frequência não tratada: ${exhaustiveCheck}`);
    }
  }
}

export async function createRecurringBill(
  businessId: string,
  direction: BillDirection,
  input: RecurringBillInput
): Promise<MutationResult<{ id: string }>> {
  const categoryError = await assertCategoryMatchesDirection(businessId, input.categoryId, direction);
  if (categoryError) return { ok: false, error: categoryError };

  const entry = await prisma.recurringBill.create({
    data: {
      businessId,
      categoryId: input.categoryId,
      description: input.description,
      amount: new Decimal(input.amount),
      frequency: input.frequency,
      ...fieldsForFrequency(input),
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      documentNumber: input.documentNumber || null,
      counterpartyName: input.counterpartyName || null,
      paymentMethod: input.paymentMethod || null,
      bankAccount: input.bankAccount || null,
      costCenter: input.costCenter || null,
      notes: input.notes || null,
    },
    select: { id: true },
  });

  return { ok: true, value: entry };
}

// Editar o molde nunca altera ocorrencias (Bill) ja materializadas - so as
// futuras (mesma regra de updateRecurringEntry).
export async function updateRecurringBill(
  businessId: string,
  id: string,
  direction: BillDirection,
  input: RecurringBillInput
): Promise<MutationResult<{ id: string }>> {
  const existing = await prisma.recurringBill.findFirst({ where: { id, businessId } });
  if (!existing) return { ok: false, error: "Recorrência não encontrada." };

  const categoryError = await assertCategoryMatchesDirection(businessId, input.categoryId, direction);
  if (categoryError) return { ok: false, error: categoryError };

  await prisma.recurringBill.update({
    where: { id },
    data: {
      categoryId: input.categoryId,
      description: input.description,
      amount: new Decimal(input.amount),
      frequency: input.frequency,
      ...fieldsForFrequency(input),
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      documentNumber: input.documentNumber || null,
      counterpartyName: input.counterpartyName || null,
      paymentMethod: input.paymentMethod || null,
      bankAccount: input.bankAccount || null,
      costCenter: input.costCenter || null,
      notes: input.notes || null,
    },
  });

  return { ok: true, value: { id } };
}

export async function setRecurringBillActive(
  businessId: string,
  id: string,
  isActive: boolean
): Promise<MutationResult<{ id: string }>> {
  const existing = await prisma.recurringBill.findFirst({ where: { id, businessId } });
  if (!existing) return { ok: false, error: "Recorrência não encontrada." };

  await prisma.recurringBill.update({ where: { id }, data: { isActive } });
  return { ok: true, value: { id } };
}

// Excluir o molde nao apaga as Bill ja geradas - onDelete: SetNull
// desvincula (viram contas avulsas no historico), mesmo padrao de
// deleteRecurringEntry.
export async function deleteRecurringBill(businessId: string, id: string): Promise<MutationResult<{ id: string }>> {
  const existing = await prisma.recurringBill.findFirst({ where: { id, businessId } });
  if (!existing) return { ok: false, error: "Recorrência não encontrada." };

  await prisma.recurringBill.delete({ where: { id } });
  return { ok: true, value: { id } };
}

export async function listRecurringBills(businessId: string, direction?: BillDirection) {
  return prisma.recurringBill.findMany({
    where: {
      businessId,
      ...(direction ? { category: { type: direction === "PAYABLE" ? { in: ["COST", "EXPENSE"] } : "REVENUE" } } : {}),
    },
    include: { category: { select: { id: true, name: true, type: true } } },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });
}
