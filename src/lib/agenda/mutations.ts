import { Prisma, type AppointmentStatus, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertClientBelongsToBusiness } from "@/lib/clients/mutations";
// assertCategoryMatches: na conclusao TIMED, createSale ja a chama; no fluxo
// DAY a categoria e escolhida na criacao, entao e validada ja ali.
import { assertCategoryMatches } from "@/lib/finance/mutations";
import { createSale, type CreateSaleInput } from "@/lib/sales/mutations";
import { isNoValueDayInput, type DayAppointmentInput } from "@/lib/agenda/schema";
import { dateKeyToDbDate, dbDateToKey, todayKey, type TimeZone } from "@/lib/time/zoned";
import { getBusinessTimeZone } from "@/lib/time/businessClock";
import { dayFromInput } from "@/lib/finance/entryDay";
import {
  autoCompleteEligibleAfter,
  canTransition,
  canTransitionDay,
  computeEndAt,
  detectOverlap,
  requireTimed,
  resolveSaleDayFromAppointment,
  type ExistingAppointment,
} from "@/lib/agenda/calculations";

type Db = PrismaClient | Prisma.TransactionClient;

const { Decimal } = Prisma;

export type MutationResult<T> = { ok: true; value: T } | { ok: false; error: string; conflicts?: ExistingAppointment[] };

// Statuses que efetivamente ocupam um horario (usados tanto pra checar
// sobreposicao quanto pra decidir quais linhas contam como "ativas" ao
// listar conflitos) - CANCELADO/FALTOU ficam de fora (ver
// OVERLAP_IGNORED_STATUSES em calculations.ts, que aplica a mesma regra do
// lado da funcao pura).
const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = ["AGENDADO", "CONFIRMADO", "CONCLUIDO"];

// So o fluxo TIMED ocupa horario (o fluxo DAY, Agenda A1, nao tem horario).
async function fetchActiveAppointments(db: Db, businessId: string): Promise<ExistingAppointment[]> {
  const appointments = await db.appointment.findMany({
    where: { businessId, kind: "TIMED", status: { in: ACTIVE_APPOINTMENT_STATUSES } },
    select: { id: true, startAt: true, endAt: true, status: true },
  });
  return appointments.map(requireTimed);
}

// Valida que todo productId pertence a empresa, e do tipo SERVICO e esta
// ativo - E busca os dados pra "congelar" no AppointmentService (name/
// duration), numa unica query (evita um round-trip de validacao separado de
// um round-trip de leitura). durationMinutes null aqui seria uma
// inconsistencia de dados (Product SERVICO deveria sempre ter duracao) -
// tratado como erro em vez de um `!` que mascararia o problema em runtime.
async function loadServiceProducts(
  db: Db,
  businessId: string,
  productIds: string[]
): Promise<{ ok: true; products: { id: string; name: string; durationMinutes: number }[] } | { ok: false; error: string }> {
  const products = await db.product.findMany({
    where: { id: { in: productIds }, businessId, type: "SERVICO", active: true },
  });

  const byId = new Map(products.map((p) => [p.id, p]));
  const missing = productIds.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    return { ok: false, error: "Um ou mais serviços não foram encontrados." };
  }

  const withMissingDuration = products.find((p) => p.durationMinutes == null);
  if (withMissingDuration) {
    return { ok: false, error: `O serviço "${withMissingDuration.name}" está sem duração cadastrada.` };
  }

  return {
    ok: true,
    products: productIds.map((id) => {
      const product = byId.get(id)!;
      return { id: product.id, name: product.name, durationMinutes: product.durationMinutes! };
    }),
  };
}

export type AppointmentServiceInput = { productId: string };

export type AppointmentMutationInput = {
  clientId: string;
  startAt: Date; // ja convertido do fuso da empresa pra instante pelo chamador (rota), via parseAgendaDateTimeInput
  services: AppointmentServiceInput[];
  notes?: string | null;
  allowOverlap?: boolean;
};

// Fluxo COM HORARIO (TIMED, legado): desde a Agenda A6 nao ha mais criacao -
// toda criacao nova e DAY (createDayAppointment). Os TIMED existentes ainda
// sao editados/remarcados aqui, com a mesma checagem de sobreposicao.
//
// Editar/remarcar - so em AGENDADO/CONFIRMADO (ver updateMany condicional
// abaixo, mesmo padrao de compare-and-swap que completeAppointment usa pra
// mudar status). Sempre substitui o conjunto de servicos por inteiro
// (deleteMany + createMany, na mesma transacao) - nunca insere por cima do
// conjunto antigo, entao a constraint @@unique(appointmentId, position)
// nunca ve dois registros com o mesmo par ao mesmo tempo.
export async function updateAppointment(
  businessId: string,
  id: string,
  input: AppointmentMutationInput
): Promise<MutationResult<{ id: string }>> {
  const clientError = await assertClientBelongsToBusiness(businessId, input.clientId);
  if (clientError) return { ok: false, error: clientError };

  const productIds = input.services.map((s) => s.productId);
  const loaded = await loadServiceProducts(prisma, businessId, productIds);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const endAt = computeEndAt(
    input.startAt,
    loaded.products.map((p) => ({ durationMinutesSnapshot: p.durationMinutes }))
  );

  if (!input.allowOverlap) {
    const existing = await fetchActiveAppointments(prisma, businessId);
    const conflicts = detectOverlap({ startAt: input.startAt, endAt }, existing, { excludeId: id });
    if (conflicts.length > 0) {
      return { ok: false, error: "Este horário conflita com outro(s) agendamento(s).", conflicts };
    }
  }

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.appointment.updateMany({
      where: { id, businessId, kind: "TIMED", status: { in: ["AGENDADO", "CONFIRMADO"] } },
      data: { clientId: input.clientId, startAt: input.startAt, endAt, notes: input.notes || null },
    });

    if (claimed.count === 0) {
      return { ok: false, error: "Só é possível editar agendamentos com status Agendado ou Confirmado." };
    }

    await tx.appointmentService.deleteMany({ where: { appointmentId: id } });
    await tx.appointmentService.createMany({
      data: loaded.products.map((p, index) => ({
        appointmentId: id,
        productId: p.id,
        nameSnapshot: p.name,
        durationMinutesSnapshot: p.durationMinutes,
        position: index,
      })),
    });

    return { ok: true, value: { id } };
  });
}

// --- Fluxo por dia (DAY, Agenda A3) ---------------------------------------

// Mesma validacao de loadServiceProducts, SEM exigir duracao (o fluxo DAY
// nao tem horario). Devolve o nome para o snapshot.
async function loadDayServiceProducts(
  db: Db,
  businessId: string,
  productIds: string[]
): Promise<{ ok: true; names: Map<string, string> } | { ok: false; error: string }> {
  const products = await db.product.findMany({
    where: { id: { in: productIds }, businessId, type: "SERVICO", active: true },
    select: { id: true, name: true },
  });
  if (products.length !== new Set(productIds).size) {
    return { ok: false, error: "Um ou mais serviços não foram encontrados." };
  }
  return { ok: true, names: new Map(products.map((p) => [p.id, p.name])) };
}

async function validateDayInput(businessId: string, input: DayAppointmentInput) {
  // Cliente opcional (sem valor); categoria so quando ha valor (sem valor ela
  // nao e exigida nem gravada).
  if (input.clientId) {
    const clientError = await assertClientBelongsToBusiness(businessId, input.clientId);
    if (clientError) return { ok: false as const, error: clientError };
  }
  if (!isNoValueDayInput(input)) {
    const categoryError = await assertCategoryMatches(businessId, input.categoryId!, "REVENUE");
    if (categoryError) return { ok: false as const, error: categoryError };
  }
  return loadDayServiceProducts(prisma, businessId, input.services.map((s) => s.productId));
}

function dayServiceRows(input: DayAppointmentInput, names: Map<string, string>) {
  return input.services.map((s, position) => ({
    productId: s.productId,
    nameSnapshot: names.get(s.productId)!,
    durationMinutesSnapshot: null,
    unitPrice: new Decimal(s.unitPrice),
    quantity: s.quantity,
    position,
  }));
}

// Parcelas planejadas so a prazo (a vista: a unica parcela e o proprio dia,
// gerada na conclusao).
function dayInstallmentRows(input: DayAppointmentInput) {
  if (isNoValueDayInput(input) || input.paymentTiming !== "APRAZO") return [];
  return input.installments.map((i, position) => ({ position, dueOn: dateKeyToDbDate(i.dueOn), amount: new Decimal(i.amount) }));
}

// Sem valor (total zero): categoria, pagamento e parcelas NAO sao gravados
// (nulos), mesmo que o cliente da API os envie - a CHECK
// appointments_payment_coherence_check exige os dois nulos ou os dois
// preenchidos, e o Zod ja garantiu os dois preenchidos quando ha valor.
function dayAppointmentFields(input: DayAppointmentInput) {
  const hasValue = !isNoValueDayInput(input);
  return {
    clientId: input.clientId || null,
    title: input.title || null,
    scheduledOn: dateKeyToDbDate(input.scheduledOn),
    categoryId: hasValue ? input.categoryId! : null,
    paymentTiming: hasValue ? input.paymentTiming! : null,
    paymentMethod: hasValue ? input.paymentMethod || null : null,
    notes: input.notes || null,
  };
}

// Criar (Agenda A3): toda criacao nova da Agenda e DAY, AGENDADO e elegivel
// a conclusao automatica (decisao 7). `input` ja passou por
// dayAppointmentInputSchema na rota.
export async function createDayAppointment(businessId: string, input: DayAppointmentInput): Promise<MutationResult<{ id: string }>> {
  const loaded = await validateDayInput(businessId, input);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const created = await prisma.appointment.create({
    data: {
      businessId,
      kind: "DAY",
      status: "AGENDADO",
      autoCompleteEligible: true,
      ...dayAppointmentFields(input),
      services: { create: dayServiceRows(input, loaded.names) },
      installments: { create: dayInstallmentRows(input) },
    },
    select: { id: true },
  });

  return { ok: true, value: created };
}

// Editar (Agenda A3): so em AGENDADO, via updateMany condicional (mesmo
// compare-and-swap de updateAppointment). Substitui servicos e parcelas por
// inteiro na mesma transacao. NUNCA mexe em autoCompleteEligible (um
// agendamento reaberto continua fora do automatico depois de editado).
export async function updateDayAppointment(
  businessId: string,
  id: string,
  input: DayAppointmentInput
): Promise<MutationResult<{ id: string }>> {
  const loaded = await validateDayInput(businessId, input);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.appointment.updateMany({
      where: { id, businessId, kind: "DAY", status: "AGENDADO" },
      data: dayAppointmentFields(input),
    });
    if (claimed.count === 0) {
      return { ok: false, error: "Só é possível editar agendamentos com status Agendado." };
    }

    await tx.appointmentService.deleteMany({ where: { appointmentId: id } });
    await tx.appointmentService.createMany({ data: dayServiceRows(input, loaded.names).map((row) => ({ ...row, appointmentId: id })) });
    await tx.appointmentInstallment.deleteMany({ where: { appointmentId: id } });
    const installments = dayInstallmentRows(input);
    if (installments.length > 0) {
      await tx.appointmentInstallment.createMany({ data: installments.map((row) => ({ ...row, appointmentId: id })) });
    }

    return { ok: true, value: { id } };
  });
}

export type ChangeStatusOptions = { allowOverlap?: boolean; now?: Date };

// Unica funcao que muda o status de um agendamento fora de completeAppointment
// (confirmar/cancelar/faltou/reabrir). SEMPRE valida via canTransition
// (tabela exaustiva, ver calculations.ts) e SEMPRE escreve via updateMany
// com o status de origem exato no where (compare-and-swap contra uma
// corrida entre o read de `current` e este write - ex.: outra requisicao
// concluindo o mesmo agendamento entre os dois). Cancelar e idempotente
// (mesmo padrao de cancelSale); as demais transicoes invalidas retornam
// erro.
export async function changeAppointmentStatus(
  businessId: string,
  id: string,
  to: AppointmentStatus,
  options: ChangeStatusOptions = {}
): Promise<MutationResult<{ id: string }>> {
  const now = options.now ?? new Date();

  const current = await prisma.appointment.findFirst({ where: { id, businessId } });
  if (!current) return { ok: false, error: "Agendamento não encontrado." };

  if (to === "CANCELADO" && current.status === "CANCELADO") {
    return { ok: true, value: { id } };
  }

  if (current.kind === "DAY") {
    // Fluxo DAY (Agenda A2): transicoes por DIA no fuso da empresa, sem
    // horario e sem checagem de sobreposicao.
    const today = todayKey({ timeZone: await getBusinessTimeZone(businessId), now });
    const transition = canTransitionDay(current.status, to, { scheduledOn: dbDateToKey(current.scheduledOn!), today });
    if (!transition.ok) return { ok: false, error: transition.error };
  } else {
    const timed = requireTimed(current);
    const transition = canTransition(current.status, to, { startAt: timed.startAt, now });
    if (!transition.ok) return { ok: false, error: transition.error };

    // Reabrir (CANCELADO/FALTOU -> AGENDADO) reaplica a checagem de
    // sobreposicao - o horario nao muda, mas o mundo pode ter mudado desde que
    // este agendamento foi cancelado/marcado falta (outro agendamento pode ja
    // ocupar o mesmo horario agora).
    if (to === "AGENDADO" && !options.allowOverlap) {
      const existing = await fetchActiveAppointments(prisma, businessId);
      const conflicts = detectOverlap({ startAt: timed.startAt, endAt: timed.endAt }, existing, { excludeId: id });
      if (conflicts.length > 0) {
        return { ok: false, error: "Este horário conflita com outro(s) agendamento(s).", conflicts };
      }
    }
  }

  const data: { status: AppointmentStatus; cancelledAt?: Date | null; autoCompleteEligible?: false } = { status: to };
  if (to === "CANCELADO") data.cancelledAt = now;
  if (to === "AGENDADO") data.cancelledAt = null;
  // Decisao 7: cancelar/faltar/reabrir tira da conclusao automatica para
  // sempre. TIMED ja e sempre false (CHECK no banco) - gravar false de novo
  // nao muda nada nele.
  const eligible = autoCompleteEligibleAfter(current.status, to);
  if (eligible !== undefined) data.autoCompleteEligible = eligible;

  const updated = await prisma.appointment.updateMany({
    where: { id, businessId, status: current.status },
    data,
  });

  if (updated.count === 0) {
    return { ok: false, error: "O status deste agendamento mudou - recarregue e tente novamente." };
  }

  return { ok: true, value: { id } };
}

export type CompleteAppointmentItemInput = {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
};

export type CompleteAppointmentInstallmentInput = {
  dueDate: string;
  amount: number;
  paidNow?: boolean;
};

export type CompleteAppointmentInput = {
  categoryId: string;
  items: CompleteAppointmentItemInput[];
  paymentMethod?: string | null;
  installments: CompleteAppointmentInstallmentInput[];
};

// clientRequestId da venda de uma conclusao TIMED (Agenda A4): "agenda:<id>"
// enquanto a conclusao nunca foi desfeita (mantem as vendas ja gravadas) e
// "agenda:<id>:<seq>" depois de um desfazer - senao createSale reaproveitaria
// a venda cancelada pelo desfazer em vez de criar uma nova (mesma regra de
// dayCompletionRequestId no fluxo DAY).
export function timedCompletionRequestId(appointmentId: string, completionSeq: number): string {
  return completionSeq > 0 ? `agenda:${appointmentId}:${completionSeq}` : `agenda:${appointmentId}`;
}

export type CompleteAppointmentResult = {
  id: string;
  saleId: string;
  saleNumber: number;
  alreadyCompleted: boolean;
};

// O ponto mais critico da Etapa 8. Tudo em UMA transacao: (1) reivindica a
// transicao com updateMany condicional no status de origem (AGENDADO ou
// CONFIRMADO) - count=0 quer dizer que outra requisicao ja mexeu nisso
// primeiro; recarrega pra decidir entre "ja concluido com saleId" (devolve
// idempotente, sem criar nada de novo) ou "transicao invalida" (erro real).
// (2) cria a Sale reaproveitando createSale(tx) da Etapa 6 - mesma funcao,
// nao uma copia. (3) grava o saleId no agendamento.
//
// QUALQUER falha depois do passo (1) tem que ABORTAR A TRANSACAO INTEIRA
// (por isso sempre `throw`, nunca `return` um resultado de erro de dentro do
// callback) - senao a reivindicacao de status (que ja escreveu CONCLUIDO no
// banco) commitaria sozinha mesmo com a Sale falhando, deixando o
// agendamento "concluido" sem venda nenhuma vinculada, um estado que a
// propria logica de idempotencia deste metodo nao sabe interpretar depois.
export async function completeAppointment(
  businessId: string,
  userId: string,
  appointmentId: string,
  input: CompleteAppointmentInput,
  // Fuso da empresa (Business.timezone, Etapa F3c) - define o dia do
  // atendimento usado como dia da venda (saleOn).
  timeZone: TimeZone
): Promise<MutationResult<CompleteAppointmentResult>> {
  const now = new Date();

  try {
    const value = await prisma.$transaction(
      async (tx) => {
        // So TIMED (Agenda A2): o fluxo DAY conclui por completeDayAppointment.
        const claimed = await tx.appointment.updateMany({
          where: { id: appointmentId, businessId, kind: "TIMED", status: { in: ["AGENDADO", "CONFIRMADO"] } },
          data: { status: "CONCLUIDO", completedAt: now },
        });

        if (claimed.count === 0) {
          const current = await tx.appointment.findFirst({ where: { id: appointmentId, businessId } });
          if (!current) throw new Error("Agendamento não encontrado.");

          if (current.status === "CONCLUIDO" && current.saleId) {
            const sale = await tx.sale.findUniqueOrThrow({ where: { id: current.saleId }, select: { saleNumber: true } });
            return { id: appointmentId, saleId: current.saleId, saleNumber: sale.saleNumber, alreadyCompleted: true };
          }

          throw new Error("Não é possível concluir este agendamento.");
        }

        const appointment = requireTimed(await tx.appointment.findUniqueOrThrow({ where: { id: appointmentId } }));

        // Diretriz aprovada (Etapa 8, incremento 3): o dia da venda (e o dia do
        // recebimento a vista) e o dia do ATENDIMENTO (startAt) no fuso da
        // empresa, nunca `now`/completedAt - cobre corretamente o registro
        // retroativo (dono conclui dias depois de o servico ter sido prestado).
        const saleOn = resolveSaleDayFromAppointment(appointment.startAt, timeZone);

        // TIMED sempre tem cliente (CHECK appointments_timed_client_check).
        if (!appointment.clientId) throw new Error("Agendamento sem cliente.");

        const saleInput: CreateSaleInput = {
          clientRequestId: timedCompletionRequestId(appointmentId, appointment.completionSeq),
          status: "CONFIRMED",
          clientId: appointment.clientId,
          categoryId: input.categoryId,
          saleOn,
          items: input.items.map((item) => ({
            productId: item.productId || null,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
          discount: null,
          paymentMethod: input.paymentMethod || null,
          installments: input.installments.map((installment) => ({
            // paidNow: vencimento = dia da venda (dia do atendimento) -
            // NUNCA completedAt (ver resolveSaleDayFromAppointment em
            // calculations.ts). Parcela a prazo comum mantem o dia que o
            // usuario escolheu no formulario, igual ao fluxo de venda.
            dueOn: installment.paidNow ? saleOn : dayFromInput(installment.dueDate, timeZone),
            amount: installment.amount,
            paidNow: installment.paidNow,
          })),
          notes: null,
        };

        const saleResult = await createSale(businessId, userId, saleInput, tx);
        if (!saleResult.ok) throw new Error(saleResult.error);

        await tx.appointment.update({ where: { id: appointmentId }, data: { saleId: saleResult.value.id } });

        return {
          id: appointmentId,
          saleId: saleResult.value.id,
          saleNumber: saleResult.value.saleNumber,
          alreadyCompleted: false,
        };
      },
      { timeout: 10000 }
    );

    return { ok: true, value };
  } catch (error) {
    if (error instanceof Error) return { ok: false, error: error.message };
    throw error;
  }
}
