import { prisma } from "@/lib/db";
import { completeDayAppointment } from "@/lib/agenda/dayCompletion";
import { dateKeyToDbDate, todayKey, type BusinessClock } from "@/lib/time/zoned";

// Lote e limite de tempo da conclusao automatica (Agenda A5): o que sobrar
// fica para a proxima carga de pagina.
export const AUTO_COMPLETE_BATCH_SIZE = 50;
export const AUTO_COMPLETE_TIME_BUDGET_MS = 3000;

export type AutoCompleteResult = {
  completed: number;
  failed: number;
  // true quando parou pelo limite de tempo com pendentes ainda na fila.
  stoppedByTimeLimit: boolean;
};

// Conclusao AUTOMATICA (Agenda A5), chamada nas cargas de pagina antes da
// leitura dos dados (mesmo gatilho preguicoso da materializacao de
// recorrentes - nunca cron/job). Conclui os atendimentos DAY ainda AGENDADO
// e elegiveis cujo dia ja TERMINOU no fuso da empresa (scheduledOn
// ESTRITAMENTE antes de hoje - o dia corrente nunca), em ordem de dia e id.
//
// Cada um passa por completeDayAppointment (uma transacao por atendimento,
// idempotente: duas cargas simultaneas nao duplicam venda - a segunda ve o
// updateMany condicional com count=0). A venda fica no dia do atendimento,
// nao no dia da carga. TIMED, cancelados, faltas, reabertos e desfeitos tem
// autoCompleteEligible=false (ou outro status) e nunca entram no filtro.
//
// Uma falha (ex.: servico sem valor) e registrada no log do servidor e
// pulada - nao interrompe os demais nem a pagina; o atendimento fica
// AGENDADO e a Agenda mostra o aviso (calculado na leitura). Nada aqui
// lanca excecao para o chamador.
export async function autoCompleteDueAppointments(
  businessId: string,
  clock: BusinessClock,
  options: { batchSize?: number; timeBudgetMs?: number } = {}
): Promise<AutoCompleteResult> {
  const batchSize = options.batchSize ?? AUTO_COMPLETE_BATCH_SIZE;
  const deadline = Date.now() + (options.timeBudgetMs ?? AUTO_COMPLETE_TIME_BUDGET_MS);
  const today = dateKeyToDbDate(todayKey(clock));
  const skipped: string[] = [];
  const result: AutoCompleteResult = { completed: 0, failed: 0, stoppedByTimeLimit: false };

  try {
    for (;;) {
      const batch = await prisma.appointment.findMany({
        where: {
          businessId,
          kind: "DAY",
          status: "AGENDADO",
          autoCompleteEligible: true,
          scheduledOn: { lt: today },
          ...(skipped.length > 0 ? { id: { notIn: skipped } } : {}),
        },
        orderBy: [{ scheduledOn: "asc" }, { id: "asc" }],
        take: batchSize,
        select: { id: true },
      });
      if (batch.length === 0) return result;

      for (const { id } of batch) {
        if (Date.now() >= deadline) {
          result.stoppedByTimeLimit = true;
          return result;
        }
        let error: unknown = null;
        try {
          const outcome = await completeDayAppointment(businessId, id, clock);
          if (outcome.ok) {
            if (!outcome.value.alreadyCompleted) result.completed++;
            continue;
          }
          error = outcome.error;
        } catch (thrown) {
          error = thrown;
        }
        result.failed++;
        skipped.push(id);
        console.error(`[agenda] conclusão automática falhou (empresa ${businessId}, agendamento ${id}):`, error);
      }
    }
  } catch (error) {
    // So a consulta do lote cai aqui (ex.: banco fora): a pagina segue.
    console.error(`[agenda] conclusão automática interrompida (empresa ${businessId}):`, error);
    return result;
  }
}
