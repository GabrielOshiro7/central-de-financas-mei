import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateOccurrencesForEntry } from "@/lib/finance/recurring/occurrences";

// Materializacao preguicosa (secao "MATERIALIZACAO" da Etapa 4.1): chamada a
// cada leitura de dados financeiros (Receitas/Custos/Despesas, Caixa,
// dashboard), nunca por cron/job em background. Gera FinancialEntry
// REAIS pras ocorrencias entre a primeira ocorrencia valida de cada molde
// ativo e `uptoDate` (nunca alem de "agora" - o chamador nunca deve passar
// uma data futura).
//
// Idempotencia/concorrencia: usa createMany + skipDuplicates (nunca create()
// em loop, que lancaria erro em violacao de constraint). A constraint UNIQUE
// (recurringEntryId, occurredAt) em FinancialEntry garante que duas chamadas
// simultaneas (ex.: duas abas carregando o dashboard ao mesmo tempo) tentando
// inserir a MESMA ocorrencia terminam sem erro visivel e sem duplicata - a
// segunda chamada so tem suas linhas ja existentes ignoradas pelo
// skipDuplicates.
export async function materializeRecurringEntries(
  businessId: string,
  userId: string,
  uptoDate: Date = new Date()
): Promise<{ created: number }> {
  const activeEntries = await prisma.recurringEntry.findMany({
    where: { businessId, isActive: true, startDate: { lte: uptoDate } },
  });

  if (activeEntries.length === 0) return { created: 0 };

  const rows: Prisma.FinancialEntryCreateManyInput[] = [];
  for (const entry of activeEntries) {
    const occurrences = generateOccurrencesForEntry(
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

    for (const occurredAt of occurrences) {
      rows.push({
        businessId,
        userId,
        type: entry.type,
        categoryId: entry.categoryId,
        description: entry.description,
        amount: entry.amount,
        occurredAt,
        source: "RECURRING",
        recurringEntryId: entry.id,
      });
    }
  }

  if (rows.length === 0) return { created: 0 };

  const result = await prisma.financialEntry.createMany({ data: rows, skipDuplicates: true });
  return { created: result.count };
}
