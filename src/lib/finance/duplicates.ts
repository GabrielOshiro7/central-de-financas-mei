import { prisma } from "@/lib/db";
import type { ValidatedImportRow } from "@/lib/finance/importValidation";

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function normalizeDescription(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

// Compara cada linha valida contra lancamentos ja importados anteriormente
// para essa empresa (source = IMPORT), usando data + tipo + descricao + valor
// como chave de identificacao (secao 14). So compara contra importacoes
// anteriores, nao contra lancamentos manuais - reimportar o mesmo arquivo e o
// cenario que essa checagem protege.
export async function markPotentialDuplicates(
  businessId: string,
  rows: ValidatedImportRow[]
): Promise<ValidatedImportRow[]> {
  const validRows = rows.filter((r) => r.errors.length === 0 && r.occurredAt);
  if (validRows.length === 0) return rows;

  const dates = validRows.map((r) => r.occurredAt as Date);
  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
  maxDate.setDate(maxDate.getDate() + 1);

  const existing = await prisma.financialEntry.findMany({
    where: { businessId, source: "IMPORT", occurredAt: { gte: minDate, lt: maxDate } },
    select: { type: true, occurredAt: true, description: true, amount: true },
  });

  return rows.map((row) => {
    if (row.errors.length > 0 || !row.occurredAt || row.amount === null) return row;

    const isDuplicate = existing.some(
      (e) =>
        e.type === row.type &&
        sameDay(e.occurredAt, row.occurredAt as Date) &&
        normalizeDescription(e.description) === normalizeDescription(row.description) &&
        e.amount.toNumber() === row.amount
    );

    return isDuplicate ? { ...row, isDuplicate: true } : row;
  });
}
