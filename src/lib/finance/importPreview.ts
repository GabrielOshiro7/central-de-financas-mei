import type { Currency, FinancialEntryType } from "@prisma/client";
import { parseCsvBuffer, parseXlsxBuffer } from "@/lib/finance/importParsing";
import { validateImportRow, type ValidatedImportRow } from "@/lib/finance/importValidation";
import { markPotentialDuplicates } from "@/lib/finance/duplicates";
import { listVisibleCategories } from "@/lib/finance/categories";

export type ImportFormat = "csv" | "xlsx";

// Uma entrada por combinacao unica (tipo + nome normalizado) de categoria
// nao encontrada, agrupando todas as linhas que a citam - a previa mostra
// isso como "N novas categorias serao criadas ao confirmar" (Etapa 3.1,
// item 2), em vez de repetir o mesmo aviso linha a linha.
export type NewCategoryGroup = {
  key: string; // `${type}:${normalizedName}` - usado tambem para casar com as decisoes enviadas na confirmacao
  type: FinancialEntryType;
  normalizedName: string;
  name: string; // primeira grafia encontrada, so para exibir
  rowCount: number;
};

export type PreviewImportResult =
  | {
      ok: true;
      rows: ValidatedImportRow[];
      totalCount: number;
      validCount: number;
      invalidCount: number;
      duplicateCount: number;
      newCategories: NewCategoryGroup[];
    }
  | { ok: false; error: string };

export function groupNewCategories(rows: ValidatedImportRow[]): NewCategoryGroup[] {
  const groups = new Map<string, NewCategoryGroup>();

  for (const row of rows) {
    if (row.errors.length > 0 || row.categoryStatus !== "new" || !row.type) continue;

    const key = `${row.type}:${row.categoryNormalized}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rowCount += 1;
    } else {
      groups.set(key, {
        key,
        type: row.type,
        normalizedName: row.categoryNormalized,
        name: row.categoryName,
        rowCount: 1,
      });
    }
  }

  return Array.from(groups.values());
}

// Fluxo seguro de importacao (secao 13): so le e valida, nunca grava no
// banco. A gravacao so acontece em confirmImport(), depois de o usuario
// revisar/corrigir a previa e confirmar explicitamente - isso vale tanto
// para os lancamentos quanto para categorias novas (Etapa 3.1, item 4).
export async function previewImport(
  businessId: string,
  currency: Currency,
  buffer: Buffer,
  format: ImportFormat
): Promise<PreviewImportResult> {
  const parsed = format === "csv" ? parseCsvBuffer(buffer) : await parseXlsxBuffer(buffer);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const categories = await listVisibleCategories(businessId);
  const validated = parsed.rows.map((row, index) =>
    validateImportRow(row, index + 2, categories, currency)
  );
  const withDuplicates = await markPotentialDuplicates(businessId, validated);

  return {
    ok: true,
    rows: withDuplicates,
    totalCount: withDuplicates.length,
    validCount: withDuplicates.filter((r) => r.errors.length === 0).length,
    invalidCount: withDuplicates.filter((r) => r.errors.length > 0).length,
    duplicateCount: withDuplicates.filter((r) => r.isDuplicate).length,
    newCategories: groupNewCategories(withDuplicates),
  };
}
