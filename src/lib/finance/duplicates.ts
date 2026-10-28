import { prisma } from "@/lib/db";
import type { ValidatedImportRow } from "@/lib/finance/importValidation";
import { addDays, dateKeyToDbDate, dbDateToKey, toDateKey, type TimeZone } from "@/lib/time/zoned";

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
// inteiros nesse fuso. Etapa F6a-2: o dia do lancamento existente e o
// occurredOn gravado (sem converter instante); o da linha da planilha e o dia
// que ela traz (occurredAt da linha = 00:00 desse dia no fuso da empresa).
export async function markPotentialDuplicates(
  businessId: string,
  rows: ValidatedImportRow[],
  timeZone: TimeZone
): Promise<ValidatedImportRow[]> {
  const validRows = rows.filter((r) => r.errors.length === 0 && r.occurredAt);
  if (validRows.length === 0) return rows;

  const keys = validRows.map((r) => toDateKey(r.occurredAt as Date, timeZone)).sort();
  const existing = await prisma.financialEntry.findMany({
    where: {
      businessId,
      source: "IMPORT",
      occurredOn: { gte: dateKeyToDbDate(keys[0]), lt: dateKeyToDbDate(addDays(keys[keys.length - 1], 1)) },
    },
    select: { type: true, occurredOn: true, description: true, amount: true },
  });
  const existingWithKey = existing.map((e) => ({ ...e, dateKey: dbDateToKey(e.occurredOn) }));

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
