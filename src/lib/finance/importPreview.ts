import type { Currency } from "@prisma/client";
import { parseCsvBuffer, parseXlsxBuffer } from "@/lib/finance/importParsing";
import { validateImportRow, type ValidatedImportRow } from "@/lib/finance/importValidation";
import { markPotentialDuplicates } from "@/lib/finance/duplicates";
import { listVisibleCategories } from "@/lib/finance/categories";

export type ImportFormat = "csv" | "xlsx";

export type PreviewImportResult =
  | {
      ok: true;
      rows: ValidatedImportRow[];
      totalCount: number;
      validCount: number;
      invalidCount: number;
      duplicateCount: number;
    }
  | { ok: false; error: string };

// Fluxo seguro de importacao (secao 13): so le e valida, nunca grava no
// banco. A gravacao so acontece em confirmImport(), depois de o usuario
// revisar/corrigir a previa e confirmar explicitamente.
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
  };
}
