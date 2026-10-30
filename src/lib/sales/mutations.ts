import { Prisma, type SaleStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getBusinessTimeZone } from "@/lib/time/businessClock";
import { dbDateOfInstant } from "@/lib/time/zoned";
import { assertClientBelongsToBusiness } from "@/lib/clients/mutations";
import { assertCategoryMatches } from "@/lib/finance/mutations";
import { calculateSaleTotals, type SaleDiscountInput, type SaleItemInput } from "@/lib/sales/calculations";

const { Decimal } = Prisma;

export type MutationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type SaleItemMutationInput = SaleItemInput & {
  productId?: string | null;
  description: string;
};

export type SaleInstallmentInput = {
  dueDate: Date;
  amount: number | string;
  paidNow?: boolean;
};

export type CreateSaleInput = {
  clientRequestId: string;
  status: Extract<SaleStatus, "DRAFT" | "CONFIRMED">;
  clientId: string;
  categoryId: string;
  saleDate: Date;
  items: SaleItemMutationInput[];
  discount: SaleDiscountInput;
  paymentMethod?: string | null;
  installments?: SaleInstallmentInput[];
  notes?: string | null;
};

// Gera as Bills de uma venda CONFIRMED (uma por parcela) e, quando ha
// exatamente uma parcela marcada `paidNow`, o FinancialEntry correspondente
// - o MESMO codigo tanto para venda a vista (1 parcela, paidNow=true) quanto
// a prazo (N parcelas PENDING), nunca dois caminhos diferentes (Etapa 6,
// decisao aprovada #2). `allowImmediatePaid=false` (usado por updateSale, ao
// substituir parcelas ainda PENDING de uma venda ja confirmada) desliga a
// criacao imediata de Bill PAID - editar uma venda nunca deve ser um atalho
// para fabricar um recebimento sem passar por settleBill.
//
// categoryId e sempre o da Sale (nunca um valor derivado) - e o que faz os
// paineis de distribuicao por categoria do dashboard, que ja leem
// FinancialEntry.categoryId (copiado de Bill.categoryId em settleBill),
// contabilizarem vendas corretamente sem nenhum codigo novo.
async function generateSaleBills(
  tx: Prisma.TransactionClient,
  sale: { id: string; businessId: string; categoryId: string; userId: string; saleNumber: number },
  installments: SaleInstallmentInput[],
  allowImmediatePaid: boolean
) {
  const category = await tx.category.findUniqueOrThrow({ where: { id: sale.categoryId }, select: { type: true } });
  const timeZone = await getBusinessTimeZone(sale.businessId, tx);
  const description = `Venda #${sale.saleNumber}`;

  for (const installment of installments) {
    const amount = new Decimal(installment.amount);
    const paidNow = allowImmediatePaid && installments.length === 1 && installment.paidNow === true;

    const bill = await tx.bill.create({
      data: {
        businessId: sale.businessId,
        categoryId: sale.categoryId,
        saleId: sale.id,
        description,
        amount,
        // Parcelas (de venda e de conclusao de agendamento) ainda chegam como
        // INSTANTE (a venda recebe Date ate a F6c): dueOn/paidOn = o dia
        // desse instante no fuso da empresa (regra do instante, F6b-1). Os
        // leitores ja usam so dueOn/paidOn (F6b-2).
        dueDate: installment.dueDate,
        dueOn: dbDateOfInstant(installment.dueDate, timeZone),
        status: paidNow ? "PAID" : "PENDING",
        paidAt: paidNow ? installment.dueDate : null,
        paidOn: paidNow ? dbDateOfInstant(installment.dueDate, timeZone) : null,
      },
    });

    if (paidNow) {
      // Mesmo formato de FinancialEntry que settleBill produz (bills/mutations.ts)
      // - source "BILL", occurredAt = data real do "pagamento" (aqui, a propria
      // data da venda), billId vinculado. Um unico caminho Sale -> Bill ->
      // FinancialEntry, tambem para o caso a vista.
      await tx.financialEntry.create({
        data: {
          businessId: sale.businessId,
          userId: sale.userId,
          type: category.type,
          categoryId: sale.categoryId,
          description,
          amount,
          occurredAt: bill.paidAt!,
          occurredOn: dbDateOfInstant(bill.paidAt!, timeZone), // gravacao dupla (F6a-1)
          source: "BILL",
          billId: bill.id,
        },
      });
    }
  }
}

function sumInstallments(installments: SaleInstallmentInput[]): Prisma.Decimal {
  return installments.reduce((total, i) => total.plus(new Decimal(i.amount)), new Decimal(0));
}

export type CreateSaleResult = { id: string; saleNumber: number };

// Corpo transacional puro de createSale, extraido (Etapa 8) pra ser chamado
// tanto pelo caminho normal (dentro do prisma.$transaction que createSale
// abre) quanto pelo caminho com tx externo (ver createSale abaixo) - MESMA
// logica nos dois casos, nunca uma copia. `tx` aqui e sempre uma transacao
// ja aberta (interna ou externa), nunca o client global.
async function runCreateSaleBody(
  tx: Prisma.TransactionClient,
  businessId: string,
  userId: string,
  input: CreateSaleInput,
  totals: ReturnType<typeof calculateSaleTotals>
) {
  // Idempotencia (ADENDO item 4): duplo clique/retry de rede reencontra a
  // venda ja criada em vez de duplicar. Camada 2 (rede de seguranca contra
  // corrida real) e o catch do P2002 em createSale, mesmo principio de
  // settleBill - so existe no caminho SEM tx externo (ver comentario la).
  const existing = await tx.sale.findFirst({ where: { businessId, clientRequestId: input.clientRequestId } });
  if (existing) return existing;

  // Alocacao atomica do numero sequencial - UPDATE ... SET last_sale_number
  // = last_sale_number + 1 RETURNING, serializa no lock da linha sob
  // concorrencia real (nunca SELECT MAX()+1, que colidiria com a
  // constraint unica e abortaria a transacao inteira no Postgres sem
  // possibilidade de retry dentro da mesma transacao).
  const { lastSaleNumber } = await tx.business.update({
    where: { id: businessId },
    data: { lastSaleNumber: { increment: 1 } },
    select: { lastSaleNumber: true },
  });

  const created = await tx.sale.create({
    data: {
      businessId,
      clientId: input.clientId,
      categoryId: input.categoryId,
      userId,
      saleNumber: lastSaleNumber,
      saleDate: input.saleDate,
      status: input.status,
      subtotal: totals.subtotal,
      discountType: input.discount?.type ?? null,
      discountValue: input.discount ? new Decimal(input.discount.value) : null,
      discountAmount: totals.discountAmount,
      total: totals.total,
      paymentMethod: input.paymentMethod || null,
      notes: input.notes || null,
      clientRequestId: input.clientRequestId,
      items: {
        create: input.items.map((item, index) => ({
          productId: item.productId || null,
          description: item.description,
          quantity: new Decimal(item.quantity),
          unitPrice: new Decimal(item.unitPrice),
          lineTotal: totals.itemTotals[index],
        })),
      },
    },
  });

  if (input.status === "CONFIRMED" && input.installments) {
    await generateSaleBills(
      tx,
      { id: created.id, businessId, categoryId: input.categoryId, userId, saleNumber: created.saleNumber },
      input.installments,
      true
    );
  }

  return created;
}

// `tx` opcional (Etapa 8): quando fornecido, o chamador ja esta dentro de
// uma transacao propria (ex.: completeAppointment) - createSale roda o
// corpo DIRETO nesse tx, sem abrir uma segunda transacao por cima (Prisma
// nao tem transacao aninhada real). Nesse caminho NAO ha catch de P2002:
// um erro dentro de uma transacao interativa do Prisma aborta a transacao
// inteira ate o rollback, entao nao da pra continuar fazendo queries nela
// depois (o catch abaixo so faz sentido quando createSale e dono da propria
// transacao). A checagem de idempotencia que ja roda ANTES do create
// (tx.sale.findFirst, dentro de runCreateSaleBody) cobre o caso normal; a
// corrida real de duas chamadas concorrentes pro MESMO recurso e
// responsabilidade do chamador que forneceu o tx (ver updateMany condicional
// de completeAppointment, que serializa isso uma camada acima).
export async function createSale(
  businessId: string,
  userId: string,
  input: CreateSaleInput,
  tx?: Prisma.TransactionClient
): Promise<MutationResult<CreateSaleResult>> {
  const db = tx ?? prisma;

  const clientError = await assertClientBelongsToBusiness(businessId, input.clientId, db);
  if (clientError) return { ok: false, error: clientError };

  const categoryError = await assertCategoryMatches(businessId, input.categoryId, "REVENUE", db);
  if (categoryError) return { ok: false, error: categoryError };

  const totals = calculateSaleTotals(input.items, input.discount);
  if (totals.total.isNegative()) {
    return { ok: false, error: "O desconto não pode ser maior que o subtotal." };
  }

  if (input.status === "CONFIRMED") {
    if (!input.installments || input.installments.length === 0) {
      return { ok: false, error: "Informe ao menos uma parcela para confirmar a venda." };
    }
    if (!sumInstallments(input.installments).equals(totals.total)) {
      return { ok: false, error: "A soma das parcelas não bate com o total da venda." };
    }
  }

  if (tx) {
    const sale = await runCreateSaleBody(tx, businessId, userId, input, totals);
    return { ok: true, value: { id: sale.id, saleNumber: sale.saleNumber } };
  }

  try {
    const sale = await prisma.$transaction((innerTx) => runCreateSaleBody(innerTx, businessId, userId, input, totals));
    return { ok: true, value: { id: sale.id, saleNumber: sale.saleNumber } };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.sale.findFirst({ where: { businessId, clientRequestId: input.clientRequestId } });
      if (existing) return { ok: true, value: { id: existing.id, saleNumber: existing.saleNumber } };
    }
    throw error;
  }
}

export type ConfirmSaleInput = {
  installments: SaleInstallmentInput[];
  paymentMethod?: string | null;
};

// DRAFT -> CONFIRMED: so aqui (ou em createSale ja confirmando direto) as
// Bills sao materializadas - um rascunho nunca aparece em Contas a Receber.
// Idempotente pelo mesmo padrao de settleBill: updateMany com WHERE
// status=DRAFT dentro da transacao, count=0 significa que outra requisicao
// concorrente ja confirmou primeiro (nada a fazer, nao duplica Bills).
export async function confirmSale(businessId: string, id: string, input: ConfirmSaleInput): Promise<MutationResult<{ id: string }>> {
  const sale = await prisma.sale.findFirst({ where: { id, businessId } });
  if (!sale) return { ok: false, error: "Venda não encontrada." };
  if (sale.status === "CANCELLED") return { ok: false, error: "Não é possível confirmar uma venda cancelada." };
  if (sale.status !== "DRAFT") return { ok: true, value: { id } };

  if (!sumInstallments(input.installments).equals(sale.total)) {
    return { ok: false, error: "A soma das parcelas não bate com o total da venda." };
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.sale.updateMany({
      where: { id, businessId, status: "DRAFT" },
      data: { status: "CONFIRMED", paymentMethod: input.paymentMethod || sale.paymentMethod },
    });
    if (updated.count === 0) return;

    await generateSaleBills(
      tx,
      { id: sale.id, businessId, categoryId: sale.categoryId, userId: sale.userId, saleNumber: sale.saleNumber },
      input.installments,
      true
    );
  });

  return { ok: true, value: { id } };
}

export type SaleUpdateInput = {
  clientId: string;
  categoryId: string;
  saleDate: Date;
  items: SaleItemMutationInput[];
  discount: SaleDiscountInput;
  paymentMethod?: string | null;
  installments?: SaleInstallmentInput[];
  notes?: string | null;
};

// Edicao completa (itens/valores/parcelas) - bloqueada por inteiro assim que
// qualquer parcela ja foi recebida (ADENDO item 2: nunca alterar
// retroativamente um FinancialEntry/Bill ja gerado). Nesse caso o chamador
// (rota da API) deve usar updateSaleNotes em vez desta funcao.
export async function updateSale(businessId: string, id: string, input: SaleUpdateInput): Promise<MutationResult<{ id: string }>> {
  const existing = await prisma.sale.findFirst({ where: { id, businessId }, include: { bills: true } });
  if (!existing) return { ok: false, error: "Venda não encontrada." };
  if (existing.status === "CANCELLED") return { ok: false, error: "Não é possível editar uma venda cancelada." };
  if (existing.bills.some((b) => b.status === "PAID")) {
    return {
      ok: false,
      error: "Esta venda já tem parcela recebida - só é possível editar as observações.",
    };
  }

  const clientError = await assertClientBelongsToBusiness(businessId, input.clientId);
  if (clientError) return { ok: false, error: clientError };

  const categoryError = await assertCategoryMatches(businessId, input.categoryId, "REVENUE");
  if (categoryError) return { ok: false, error: categoryError };

  const totals = calculateSaleTotals(input.items, input.discount);
  if (totals.total.isNegative()) {
    return { ok: false, error: "O desconto não pode ser maior que o subtotal." };
  }

  const totalChanged = !totals.total.equals(existing.total);
  const hasNewInstallments = Boolean(input.installments && input.installments.length > 0);

  if (existing.status === "CONFIRMED") {
    if (totalChanged && !hasNewInstallments) {
      return { ok: false, error: "O total da venda mudou - informe as novas parcelas." };
    }
    if (hasNewInstallments && !sumInstallments(input.installments!).equals(totals.total)) {
      return { ok: false, error: "A soma das parcelas não bate com o total da venda." };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.sale.update({
      where: { id },
      data: {
        clientId: input.clientId,
        categoryId: input.categoryId,
        saleDate: input.saleDate,
        subtotal: totals.subtotal,
        discountType: input.discount?.type ?? null,
        discountValue: input.discount ? new Decimal(input.discount.value) : null,
        discountAmount: totals.discountAmount,
        total: totals.total,
        paymentMethod: input.paymentMethod || null,
        notes: input.notes || null,
        items: {
          deleteMany: {},
          create: input.items.map((item, index) => ({
            productId: item.productId || null,
            description: item.description,
            quantity: new Decimal(item.quantity),
            unitPrice: new Decimal(item.unitPrice),
            lineTotal: totals.itemTotals[index],
          })),
        },
      },
    });

    // Todas as Bills existentes aqui sao PENDING (garantido pela checagem de
    // "nenhuma PAID" acima) - seguro substituir por inteiro. allowImmediatePaid
    // = false: editar uma venda nunca gera uma Bill ja PAID (isso so acontece
    // via createSale/confirmSale, nunca como efeito colateral de uma edicao).
    if (existing.status === "CONFIRMED" && hasNewInstallments) {
      await tx.bill.deleteMany({ where: { saleId: id } });
      await generateSaleBills(
        tx,
        { id, businessId, categoryId: input.categoryId, userId: existing.userId, saleNumber: existing.saleNumber },
        input.installments!,
        false
      );
    }
  });

  return { ok: true, value: { id } };
}

export async function updateSaleNotes(businessId: string, id: string, notes: string | null): Promise<MutationResult<{ id: string }>> {
  const existing = await prisma.sale.findFirst({ where: { id, businessId } });
  if (!existing) return { ok: false, error: "Venda não encontrada." };

  await prisma.sale.update({ where: { id }, data: { notes: notes || null } });
  return { ok: true, value: { id } };
}

// Bloqueia por inteiro se ja houver qualquer parcela PAID (Etapa 6, decisao
// aprovada #4/ADENDO item 3): dinheiro ja recebido nao pode "desaparecer" do
// faturamento por um cancelamento simples. Nesse caso o usuario cancela as
// parcelas PENDING restantes individualmente (tela de Contas a Receber,
// reaproveitando cancelBill) e usa revertBillSettlement se precisar estornar
// um recebimento - nenhum status novo de "parcialmente cancelada".
//
// O update das Bills PENDING para CANCELLED e feito inline (updateMany)
// dentro da MESMA transacao do cancelamento da venda, em vez de chamar a
// cancelBill ja existente em loop - cancelBill opera fora de uma transacao
// (prisma global), entao chama-la em loop aqui arriscaria cancelar algumas
// parcelas e falhar no meio, deixando a venda inconsistente. A logica em si
// (so cancela quem esta PENDING) e identica à de cancelBill.
export async function cancelSale(businessId: string, id: string): Promise<MutationResult<{ id: string }>> {
  const existing = await prisma.sale.findFirst({ where: { id, businessId }, include: { bills: true } });
  if (!existing) return { ok: false, error: "Venda não encontrada." };
  if (existing.status === "CANCELLED") return { ok: true, value: { id } };

  if (existing.bills.some((b) => b.status === "PAID")) {
    return {
      ok: false,
      error:
        "Esta venda já tem parcela recebida e não pode ser cancelada diretamente. Cancele as parcelas pendentes individualmente em Contas a Receber; para estornar um recebimento, reverta o pagamento primeiro.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.bill.updateMany({ where: { saleId: id, status: "PENDING" }, data: { status: "CANCELLED" } });
    await tx.sale.update({ where: { id }, data: { status: "CANCELLED" } });
  });

  return { ok: true, value: { id } };
}

export async function setSaleCompleted(businessId: string, id: string): Promise<MutationResult<{ id: string }>> {
  const existing = await prisma.sale.findFirst({ where: { id, businessId } });
  if (!existing) return { ok: false, error: "Venda não encontrada." };
  if (existing.status !== "CONFIRMED") {
    return { ok: false, error: "Só é possível concluir uma venda confirmada." };
  }

  await prisma.sale.update({ where: { id }, data: { status: "COMPLETED" } });
  return { ok: true, value: { id } };
}
