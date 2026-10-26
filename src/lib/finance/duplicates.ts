import { prisma } from "@/lib/db";
import type { ValidatedImportRow } from "@/lib/finance/importValidation";
import { addDays, startOfDayInstant, toDateKey, type TimeZone } from "@/lib/time/zoned";

function normalizeDescription(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

// Compara cada linha valida contra lancamentos ja importados anteriormente
// para essa empresa (source = IMPORT), usando data + tipo + descricao + valor
// como chave de identificacao (secao 14). So compara contra importacoes
// anteriores, nao contra lancamentos manuais - reimportar o mesmo arquivo e o
// cenario que essa checagem protege.
//
// Etapa F3c: "mesma data" = mesmo dia de calendario no FUSO DA EMPRESA (antes:
// getters locais, fuso do processo), e a janela da consulta cobre os dias
// inteiros nesse fuso.
export async function markPotentialDuplicates(
  businessId: string,
  rows: ValidatedImportRow[],
  timeZone: TimeZone
): Promise<ValidatedImportRow[]> {
  const validRows = rows.filter((r) => r.errors.length === 0 && r.occurredAt);
  if (validRows.length === 0) return rows;

  const keys = validRows.map((r) => toDateKey(r.occurredAt as Date, timeZone)).sort();
  const start = startOfDayInstant(keys[0], timeZone);
  const end = startOfDayInstant(addDays(keys[keys.length - 1], 1), timeZone);

  const existing = await prisma.financialEntry.findMany({
    where: { businessId, source: "IMPORT", occurredAt: { gte: start, lt: end } },
    select: { type: true, occurredAt: true, description: true, amount: true },
  });
  const existingWithKey = existing.map((e) => ({ ...e, dateKey: toDateKey(e.occurredAt, timeZone) }));

  return rows.map((row) => {
    if (row.errors.length > 0 || !row.occurredAt || row.amount === null) return row;

    const rowKey = toDateKey(row.occurredAt, timeZone);
    const isDuplicate = existingWithKey.some(
      (e) =>
        e.type === row.type &&
        e.dateKey === rowKey &&
        normalizeDescription(e.description) === normalizeDescription(row.description) &&
        e.amount.toNumber() === row.amount
    );

    return isDuplicate ? { ...row, isDuplicate: true } : row;
  });
}
