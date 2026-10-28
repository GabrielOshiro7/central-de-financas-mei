import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateOccurrencesForEntry } from "@/lib/finance/recurring/occurrences";
import { getBusinessClock } from "@/lib/time/businessClock";
import { addDays, dateKeyToDbDate, startOfDayInstant, todayKey } from "@/lib/time/zoned";

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
// occurredAt de uma ocorrencia NOVA = 00:00 do dia no fuso da empresa
// (startOfDayInstant), a mesma representacao das ocorrencias ja gravadas
// (geradas com o host em JST) - entao toDateKey(occurredAt, fuso) == dia e
// as consultas por periodo (F3) continuam iguais. A troca para @db.Date e a F6.
export async function materializeRecurringEntries(
  businessId: string,
  userId: string,
  now: Date = new Date()
): Promise<{ created: number }> {
  const clock = await getBusinessClock(businessId, now);
  const today = todayKey(clock);

  const activeEntries = await prisma.recurringEntry.findMany({
    where: { businessId, isActive: true, startDate: { lt: startOfDayInstant(addDays(today, 1), clock.timeZone) } },
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
        occurredAt: startOfDayInstant(day, clock.timeZone),
        occurredOn: dateKeyToDbDate(day), // gravacao dupla (F6a-1): o proprio dia da ocorrencia
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
