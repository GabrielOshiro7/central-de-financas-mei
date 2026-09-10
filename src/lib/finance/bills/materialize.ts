import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateBillOccurrences } from "@/lib/finance/bills/occurrences";

// Diferente de materializeRecurringEntries (Etapa 4.1), que so materializa
// ate "agora" (um RecurringEntry vira dinheiro automaticamente na data,
// entao nao existe ocorrencia futura "visivel"), uma Bill PENDENTE precisa
// aparecer ANTES do vencimento - e assim que "vencendo nos proximos 30 dias"
// e o saldo previsto (Etapa 5) funcionam. Por isso materializamos com um
// horizonte para frente, nao so ate hoje. 90 dias cobre os filtros de
// vencimento previstos (hoje/7/30 dias) com folga, sem gerar volume
// descontrolado (skipDuplicates mantem idempotente mesmo chamado a cada
// leitura, como o padrao ja estabelecido).
const HORIZON_DAYS = 90;

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

// Materializacao preguicosa (mesmo padrao de materializeRecurringEntries):
// chamada em toda leitura de Contas a Pagar/Receber e do dashboard, nunca
// por cron/job em background. Gera Bill PENDENTES (nunca FinancialEntry
// diretamente - so settleBill faz isso, quando o usuario confirma o
// pagamento/recebimento) entre a primeira ocorrencia valida de cada molde
// ativo e `now + HORIZON_DAYS`.
export async function materializeRecurringBills(businessId: string, now: Date = new Date()): Promise<{ created: number }> {
  const uptoDate = addDays(now, HORIZON_DAYS);

  const activeEntries = await prisma.recurringBill.findMany({
    where: { businessId, isActive: true, startDate: { lte: uptoDate } },
  });

  if (activeEntries.length === 0) return { created: 0 };

  const rows: Prisma.BillCreateManyInput[] = [];
  for (const entry of activeEntries) {
    const occurrences = generateBillOccurrences(
      {
        frequency: entry.frequency,
        dayOfWeek: entry.dayOfWeek,
        dayOfMonth: entry.dayOfMonth,
        yearMonth: entry.yearMonth,
        startDate: entry.startDate,
        endDate: entry.endDate,
      },
      uptoDate
    );

    for (const dueDate of occurrences) {
      rows.push({
        businessId,
        categoryId: entry.categoryId,
        description: entry.description,
        amount: entry.amount,
        dueDate,
        documentNumber: entry.documentNumber,
        counterpartyName: entry.counterpartyName,
        paymentMethod: entry.paymentMethod,
        bankAccount: entry.bankAccount,
        costCenter: entry.costCenter,
        notes: entry.notes,
        recurringBillId: entry.id,
      });
    }
  }

  if (rows.length === 0) return { created: 0 };

  // Idempotencia/concorrencia: createMany + skipDuplicates contra o
  // @@unique([recurringBillId, dueDate]) - duas leituras concorrentes (ex.:
  // duas abas) tentando materializar a mesma ocorrencia terminam sem erro
  // visivel e sem duplicata, mesma tecnica de materializeRecurringEntries.
  const result = await prisma.bill.createMany({ data: rows, skipDuplicates: true });
  return { created: result.count };
}
