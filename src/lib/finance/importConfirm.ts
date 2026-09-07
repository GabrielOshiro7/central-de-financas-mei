import { Prisma, type Currency } from "@prisma/client";
import { prisma } from "@/lib/db";
import { listVisibleCategories } from "@/lib/finance/categories";
import { validateImportRow, type ValidatedImportRow } from "@/lib/finance/importValidation";
import { markPotentialDuplicates } from "@/lib/finance/duplicates";

const { Decimal } = Prisma;

export type ImportRowInput = {
  rowNumber: number;
  data: string;
  tipo: string;
  categoria: string;
  descricao: string;
  valor: string;
  observacao: string;
};
export type DuplicateAction = "skip" | "import_anyway";

export type ConfirmImportResult = {
  inserted: number;
  skippedDuplicates: number;
  failed: { rowNumber: number; errors: string[] }[];
};

// Ponto unico de verdade para a confirmacao de importacao: nunca confia nos
// valores ja "interpretados" que o cliente devolve depois da previa - refaz a
// validacao completa (mesma funcao usada na previa) e a checagem de
// duplicidade em cima do estado atual do banco antes de inserir qualquer
// coisa (secao 13: nada e salvo antes da confirmacao explicita).
export async function confirmImport(
  businessId: string,
  userId: string,
  currency: Currency,
  rowsInput: ImportRowInput[],
  duplicateAction: DuplicateAction
): Promise<ConfirmImportResult> {
  const categories = await listVisibleCategories(businessId);

  const validated: ValidatedImportRow[] = rowsInput.map(({ rowNumber, ...raw }) =>
    validateImportRow(raw, rowNumber, categories, currency)
  );

  const withDuplicateFlags = await markPotentialDuplicates(businessId, validated);

  const failed = withDuplicateFlags
    .filter((r) => r.errors.length > 0)
    .map((r) => ({ rowNumber: r.rowNumber, errors: r.errors }));

  let toInsert = withDuplicateFlags.filter((r) => r.errors.length === 0);
  let skippedDuplicates = 0;
  if (duplicateAction === "skip") {
    const duplicates = toInsert.filter((r) => r.isDuplicate);
    skippedDuplicates = duplicates.length;
    toInsert = toInsert.filter((r) => !r.isDuplicate);
  }

  if (toInsert.length > 0) {
    await prisma.financialEntry.createMany({
      data: toInsert.map((r) => ({
        businessId,
        userId,
        type: r.type!,
        categoryId: r.categoryId!,
        description: r.description,
        amount: new Decimal(r.amount!),
        occurredAt: r.occurredAt!,
        notes: r.notes || null,
        source: "IMPORT",
      })),
    });
  }

  return { inserted: toInsert.length, skippedDuplicates, failed };
}
