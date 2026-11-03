import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateOccurrencesForEntry } from "@/lib/finance/recurring/occurrences";
import { getBusinessClock } from "@/lib/time/businessClock";
import { dateKeyToDbDate, todayKey } from "@/lib/time/zoned";

// Materializacao preguicosa (secao "MATERIALIZACAO" da Etapa 4.1): chamada a
// cada leitura de dados financeiros (Receitas/Custos/Despesas, Caixa,
// dashboard), nunca por cron/job em background. Gera FinancialEntry
// REAIS pras ocorrencias entre a primeira ocorrencia valida de cada molde
// ativo e o dia de `now` no fuso da empresa (nunca alem de "agora" - o
// chamador nunca deve passar uma data futura).
//
// Idempotencia/concorrencia (Etapa F5): usa createMany + skipDuplicates
// (nunca create() em loop, que lancaria erro em violacao de constraint)
// contra a UNIQUE (recurringEntryId, occurrenceDate) - o DIA DE CALENDARIO da
// ocorrencia, nao o instante. Duas chamadas simultaneas (ex.: duas abas) ou
// duas chamadas com o processo em fusos diferentes geram a MESMA chave para
// o mesmo dia; a segunda so tem suas linhas ignoradas pelo skipDuplicates.
//
// O dia de uma ocorrencia NOVA (occurredOn) e o proprio dia gerado pelo
// motor. Inicio/fim do molde sao os dias gravados em startOn/endOn (Etapa
// F6c).
export async function materializeRecurringEntries(
  businessId: string,
  userId: string,
  now: Date = new Date()
): Promise<{ created: number }> {
  const clock = await getBusinessClock(businessId, now);
  const today = todayKey(clock);

  const activeEntries = await prisma.recurringEntry.findMany({
    // Molde que ja comecou ate hoje (startOn e o dia de inicio, F6c).
    where: { businessId, isActive: true, startOn: { lte: dateKeyToDbDate(today) } },
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
        startOn: entry.startOn,
        endOn: entry.endOn,
      },
      clock.now,
      clock.timeZone
    );

    for (const day of occurrences) {
      rows.push({
        businessId,
        userId,
        type: entry.type,
        categoryId: entry.categoryId,
        description: entry.description,
        amount: entry.amount,
        occurredOn: dateKeyToDbDate(day),
        occurrenceDate: dateKeyToDbDate(day),
        source: "RECURRING",
        recurringEntryId: entry.id,
      });
    }
  }

  if (rows.length === 0) return { created: 0 };

  const result = await prisma.financialEntry.createMany({ data: rows, skipDuplicates: true });
  return { created: result.count };
}
