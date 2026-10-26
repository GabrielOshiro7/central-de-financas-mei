import type { AppointmentStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertClientBelongsToBusiness } from "@/lib/clients/mutations";
// assertCategoryMatches nao e chamado direto aqui - createSale ja a chama
// internamente pra validar categoryId (mesma funcao reaproveitada, ver
// completeAppointment abaixo).
import { createSale, type CreateSaleInput } from "@/lib/sales/mutations";
import type { TimeZone } from "@/lib/time/zoned";
import {
  canTransition,
  computeEndAt,
  detectOverlap,
  resolveSaleDateFromAppointment,
  type ExistingAppointment,
} from "@/lib/agenda/calculations";

type Db = PrismaClient | Prisma.TransactionClient;

export type MutationResult<T> = { ok: true; value: T } | { ok: false; error: string; conflicts?: ExistingAppointment[] };

// Statuses que efetivamente ocupam um horario (usados tanto pra checar
// sobreposicao quanto pra decidir quais linhas contam como "ativas" ao
// listar conflitos) - CANCELADO/FALTOU ficam de fora (ver
// OVERLAP_IGNORED_STATUSES em calculations.ts, que aplica a mesma regra do
// lado da funcao pura).
const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = ["AGENDADO", "CONFIRMADO", "CONCLUIDO"];

async function fetchActiveAppointments(db: Db, businessId: string): Promise<ExistingAppointment[]> {
  return db.appointment.findMany({
    where: { businessId, status: { in: ACTIVE_APPOINTMENT_STATUSES } },
    select: { id: true, startAt: true, endAt: true, status: true },
  });
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

// Criar. Overlap e AVISO, nao bloqueio: se `allowOverlap` nao vier true e
// houver conflito, devolve os conflitos SEM criar nada - o chamador decide
// se reenvia com allowOverlap:true.
export async function createAppointment(businessId: string, input: AppointmentMutationInput): Promise<MutationResult<{ id: string }>> {
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
    const conflicts = detectOverlap({ startAt: input.startAt, endAt }, existing);
    if (conflicts.length > 0) {
      return { ok: false, error: "Este horário conflita com outro(s) agendamento(s).", conflicts };
    }
  }

  const created = await prisma.appointment.create({
    data: {
      businessId,
      clientId: input.clientId,
      startAt: input.startAt,
      endAt,
      notes: input.notes || null,
      services: {
        create: loaded.products.map((p, index) => ({
          productId: p.id,
          nameSnapshot: p.name,
          durationMinutesSnapshot: p.durationMinutes,
          position: index,
        })),
      },
    },
  });

  return { ok: true, value: { id: created.id } };
}

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
      where: { id, businessId, status: { in: ["AGENDADO", "CONFIRMADO"] } },
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

  const transition = canTransition(current.status, to, { startAt: current.startAt, now });
  if (!transition.ok) return { ok: false, error: transition.error };

  // Reabrir (CANCELADO/FALTOU -> AGENDADO) reaplica a checagem de
  // sobreposicao - o horario nao muda, mas o mundo pode ter mudado desde que
  // este agendamento foi cancelado/marcado falta (outro agendamento pode ja
  // ocupar o mesmo horario agora).
  let conflicts: ExistingAppointment[] | undefined;
  if (to === "AGENDADO" && !options.allowOverlap) {
    const existing = await fetchActiveAppointments(prisma, businessId);
    conflicts = detectOverlap({ startAt: current.startAt, endAt: current.endAt }, existing, { excludeId: id });
    if (conflicts.length > 0) {
      return { ok: false, error: "Este horário conflita com outro(s) agendamento(s).", conflicts };
    }
  }

  const data: { status: AppointmentStatus; cancelledAt?: Date | null } = { status: to };
  if (to === "CANCELADO") data.cancelledAt = now;
  if (to === "AGENDADO") data.cancelledAt = null;

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
  // atendimento usado como saleDate.
  timeZone: TimeZone
): Promise<MutationResult<CompleteAppointmentResult>> {
  const now = new Date();

  try {
    const value = await prisma.$transaction(
      async (tx) => {
        const claimed = await tx.appointment.updateMany({
          where: { id: appointmentId, businessId, status: { in: ["AGENDADO", "CONFIRMADO"] } },
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

        const appointment = await tx.appointment.findUniqueOrThrow({ where: { id: appointmentId } });

        // Diretriz aprovada (Etapa 8, incremento 3): saleDate/paidAt à vista
        // usam o dia do ATENDIMENTO (startAt) no fuso da empresa, nunca `now`/
        // completedAt - cobre corretamente o registro retroativo (dono
        // conclui dias depois de o servico ter sido prestado).
        const saleDate = resolveSaleDateFromAppointment(appointment.startAt, timeZone);

        const saleInput: CreateSaleInput = {
          clientRequestId: `agenda:${appointmentId}`,
          status: "CONFIRMED",
          clientId: appointment.clientId,
          categoryId: input.categoryId,
          saleDate,
          items: input.items.map((item) => ({
            productId: item.productId || null,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
          discount: null,
          paymentMethod: input.paymentMethod || null,
          installments: input.installments.map((installment) => ({
            // paidNow: dueDate/paidAt = saleDate (dia do atendimento) -
            // NUNCA completedAt (ver comentario de resolveSaleDateFromAppointment
            // em calculations.ts). Parcela a prazo comum mantem o dueDate
            // que o usuario escolheu no formulario, igual ao fluxo de venda
            // ja existente.
            dueDate: installment.paidNow ? saleDate : new Date(installment.dueDate),
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
