import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createSale, type CreateSaleInput, type SaleInstallmentInput } from "@/lib/sales/mutations";
import { dateKeyToDbDate, dbDateToKey, todayKey, type BusinessClock } from "@/lib/time/zoned";

const { Decimal } = Prisma;

export type CompleteDayAppointmentResult = {
  id: string;
  // null quando o valor total do atendimento e zero: conclui SEM venda.
  saleId: string | null;
  saleNumber: number | null;
  alreadyCompleted: boolean;
};

export type CompleteDayAppointmentOutcome =
  | { ok: true; value: CompleteDayAppointmentResult }
  | { ok: false; error: string };

// clientRequestId da venda de uma conclusao DAY: inclui o contador de
// conclusoes desfeitas (completionSeq), para que reconcluir depois de um
// desfazer crie uma venda NOVA - createSale reaproveita a venda ja existente
// com o mesmo clientRequestId, que a essa altura estaria cancelada.
export function dayCompletionRequestId(appointmentId: string, completionSeq: number): string {
  return `agenda:${appointmentId}:${completionSeq}`;
}

// Conclusao de um atendimento do fluxo DAY (Agenda A2, plano 4.4) - o nucleo
// que a conclusao manual e a automatica (Prompt 4) vao chamar. Nesta etapa so
// os testes chamam. Nada e perguntado: servicos, valores, categoria e
// pagamento ja estao gravados no agendamento desde a criacao.
//
// Uma unica transacao, idempotente em tres camadas (mesmo principio de
// completeAppointment, o fluxo TIMED):
// 1) updateMany condicional AGENDADO -> CONCLUIDO (so DAY, so ate "hoje" no
//    fuso da empresa). count=0: outra chamada (ex.: concorrente) ja concluiu
//    -> devolve a conclusao existente sem criar nada; senao, erro.
// 2) clientRequestId "agenda:<id>:<completionSeq>" com @@unique por empresa.
// 3) Appointment.saleId @unique.
// Qualquer falha depois de (1) e `throw` -> rollback de tudo (nunca um
// CONCLUIDO sem a venda que ele deveria ter gerado).
//
// Venda (decisao 8): dia = o dia do atendimento (scheduledOn), nunca o dia
// da conclusao; categoria e forma de pagamento gravadas; itens = os servicos
// com o preco snapshot; reaproveita createSale (mesmas regras da F6: a
// parcela a vista e paga no dia da venda, paidAt = instante real do
// registro). Valor total zero (decisao 6; inclui o agendamento SEM VALOR, ex.:
// reuniao, que nem tem categoria/pagamento/cliente obrigatorios): conclui sem
// venda.
export async function completeDayAppointment(
  businessId: string,
  appointmentId: string,
  clock: BusinessClock
): Promise<CompleteDayAppointmentOutcome> {
  const today = todayKey(clock);

  try {
    const value = await prisma.$transaction(
      async (tx): Promise<CompleteDayAppointmentResult> => {
        const claimed = await tx.appointment.updateMany({
          where: {
            id: appointmentId,
            businessId,
            kind: "DAY",
            status: "AGENDADO",
            scheduledOn: { lte: dateKeyToDbDate(today) },
          },
          data: { status: "CONCLUIDO", completedAt: clock.now },
        });

        if (claimed.count === 0) {
          const current = await tx.appointment.findFirst({
            where: { id: appointmentId, businessId },
            include: { sale: { select: { saleNumber: true } } },
          });
          if (!current) throw new Error("Agendamento não encontrado.");
          if (current.kind !== "DAY") throw new Error("Este agendamento não é do fluxo por dia.");
          if (current.status === "CONCLUIDO") {
            return { id: appointmentId, saleId: current.saleId, saleNumber: current.sale?.saleNumber ?? null, alreadyCompleted: true };
          }
          if (current.status === "AGENDADO") {
            throw new Error("Só é possível concluir um atendimento a partir do dia dele.");
          }
          throw new Error("Não é possível concluir este agendamento.");
        }

        const appointment = await tx.appointment.findUniqueOrThrow({
          where: { id: appointmentId },
          include: {
            services: { orderBy: { position: "asc" } },
            installments: { orderBy: { position: "asc" } },
            business: { select: { userId: true } },
          },
        });

        // O dia e garantido no banco para DAY (CHECK appointments_day_fields_check).
        // Categoria, pagamento e cliente so existem em agendamento COM valor: o
        // total e verificado ANTES de exigi-los (sem valor conclui sem venda).
        const saleOn = dbDateToKey(appointment.scheduledOn!);

        const items = appointment.services.map((service) => {
          if (service.unitPrice === null) throw new Error(`O serviço "${service.nameSnapshot}" está sem valor.`);
          return {
            productId: service.productId,
            description: service.nameSnapshot,
            quantity: service.quantity,
            unitPrice: service.unitPrice,
          };
        });
        const total = items.reduce((sum, item) => sum.plus(item.unitPrice.times(item.quantity)), new Decimal(0));

        if (total.isZero()) {
          return { id: appointmentId, saleId: null, saleNumber: null, alreadyCompleted: false };
        }

        const { categoryId, clientId, paymentTiming } = appointment;
        if (!categoryId || !paymentTiming) throw new Error("Agendamento com valor sem categoria de receita ou pagamento.");
        if (!clientId) throw new Error("Agendamento com valor sem cliente.");

        let installments: SaleInstallmentInput[];
        if (paymentTiming === "AVISTA") {
          installments = [{ dueOn: saleOn, amount: total.toString(), paidNow: true }];
        } else {
          if (appointment.installments.length === 0) throw new Error("Agendamento a prazo sem parcelas.");
          installments = appointment.installments.map((i) => ({ dueOn: dbDateToKey(i.dueOn), amount: i.amount.toString() }));
        }

        const saleInput: CreateSaleInput = {
          clientRequestId: dayCompletionRequestId(appointmentId, appointment.completionSeq),
          status: "CONFIRMED",
          clientId,
          categoryId,
          saleOn,
          items,
          discount: null,
          paymentMethod: appointment.paymentMethod,
          installments,
          notes: null,
          appointmentId,
        };

        // Usuario da venda = o dono da empresa (a conclusao automatica nao tem
        // sessao; a manual e do mesmo dono).
        const saleResult = await createSale(businessId, appointment.business.userId, saleInput, tx);
        if (!saleResult.ok) throw new Error(saleResult.error);

        await tx.appointment.update({ where: { id: appointmentId }, data: { saleId: saleResult.value.id } });

        return { id: appointmentId, saleId: saleResult.value.id, saleNumber: saleResult.value.saleNumber, alreadyCompleted: false };
      },
      { timeout: 10000 }
    );

    return { ok: true, value };
  } catch (error) {
    if (error instanceof Error) return { ok: false, error: error.message };
    throw error;
  }
}
