import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { UndoTarget } from "@/lib/agenda/schema";
import { reverseBillSettlementTx } from "@/lib/finance/bills/mutations";
import { cancelSaleTx } from "@/lib/sales/mutations";

const { Decimal } = Prisma;

export type UndoCompletionResult = {
  id: string;
  // Venda cancelada por este desfazer (null: sem venda, ou ja cancelada antes).
  cancelledSaleId: string | null;
  // Soma das parcelas recebidas que foram estornadas (sai do Caixa/Dashboard).
  reversedAmount: string;
};

export type UndoCompletionOutcome = { ok: true; value: UndoCompletionResult } | { ok: false; error: string };

export const ALREADY_UNDONE_ERROR = "Esta conclusão já foi desfeita.";

// Desfazer a conclusao de um atendimento (Agenda A4), DAY ou TIMED. Uma
// unica transacao, tudo ou nada:
// 1) updateMany condicional (so se ainda CONCLUIDO e com a MESMA venda lida):
//    muda o status para o destino, limpa saleId/completedAt, tira do
//    automatico para sempre e incrementa completionSeq. count=0: outra
//    chamada (repetida ou concorrente - a segunda espera o lock da linha e
//    reavalia o WHERE) ja desfez -> erro claro, sem estornar de novo.
// 2) Com venda nao cancelada: estorna o estado ATUAL dela (pode ter sido
//    editada depois da conclusao) - cada parcela PAGA por
//    reverseBillSettlementTx (o corpo de revertBillSettlement, Etapa R) e
//    depois cancelSaleTx (o corpo de cancelSale). Venda ja cancelada a mao:
//    so o atendimento muda. Sem venda (valor zero): so o status.
// Sale.appointmentId fica (rastro); na venda TIMED, que nao o gravava, ele e
// preenchido aqui para nao perder o vinculo quando saleId e limpo.
export async function undoAppointmentCompletion(
  businessId: string,
  appointmentId: string,
  to: UndoTarget,
  now: Date = new Date()
): Promise<UndoCompletionOutcome> {
  try {
    const value = await prisma.$transaction(
      async (tx): Promise<UndoCompletionResult> => {
        const current = await tx.appointment.findFirst({ where: { id: appointmentId, businessId } });
        if (!current) throw new Error("Agendamento não encontrado.");
        if (current.status !== "CONCLUIDO") {
          throw new Error(current.completionSeq > 0 ? ALREADY_UNDONE_ERROR : "Só é possível desfazer um atendimento concluído.");
        }

        const claimed = await tx.appointment.updateMany({
          where: { id: appointmentId, businessId, status: "CONCLUIDO", saleId: current.saleId },
          data: {
            status: to,
            saleId: null,
            completedAt: null,
            cancelledAt: to === "CANCELADO" ? now : null,
            autoCompleteEligible: false,
            completionSeq: { increment: 1 },
          },
        });
        if (claimed.count === 0) throw new Error(ALREADY_UNDONE_ERROR);

        if (!current.saleId) return { id: appointmentId, cancelledSaleId: null, reversedAmount: "0" };

        const sale = await tx.sale.findUniqueOrThrow({ where: { id: current.saleId }, include: { bills: true } });
        if (sale.appointmentId === null) {
          await tx.sale.update({ where: { id: sale.id }, data: { appointmentId } });
        }
        if (sale.status === "CANCELLED") return { id: appointmentId, cancelledSaleId: null, reversedAmount: "0" };

        let reversed = new Decimal(0);
        for (const bill of sale.bills.filter((b) => b.status === "PAID")) {
          await reverseBillSettlementTx(tx, businessId, bill.id);
          reversed = reversed.plus(bill.amount);
        }
        await cancelSaleTx(tx, sale.id);

        return { id: appointmentId, cancelledSaleId: sale.id, reversedAmount: reversed.toString() };
      },
      { timeout: 10000 }
    );
    return { ok: true, value };
  } catch (error) {
    if (error instanceof Error) return { ok: false, error: error.message };
    throw error;
  }
}
