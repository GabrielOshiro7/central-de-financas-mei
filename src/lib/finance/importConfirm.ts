import { Prisma, type Currency, type FinancialEntryType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { listVisibleCategories, findOrCreateCategoryInTx } from "@/lib/finance/categories";
import { validateImportRow, type ValidatedImportRow } from "@/lib/finance/importValidation";
import { markPotentialDuplicates } from "@/lib/finance/duplicates";
import { groupNewCategories } from "@/lib/finance/importPreview";
import { toDateKey, type TimeZone } from "@/lib/time/zoned";
import { dayColumns } from "@/lib/finance/entryDay";

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

// Uma decisao por grupo de categoria nova detectada na previa (mesma chave
// `${type}:${normalizedName}` de NewCategoryGroup). "create" (padrao,
// aplicado tambem quando o usuario nao manda nenhuma decisao para um grupo -
// Etapa 3.1, item 2) cria a categoria; "map" reaproveita uma categoria ja
// existente em vez de criar uma nova (ex.: "Salario" -> "Salários").
export type CategoryDecision =
  | { key: string; action: "create" }
  | { key: string; action: "map"; mapToCategoryId: string };

export type ConfirmImportResult = {
  inserted: number;
  skippedDuplicates: number;
  categoriesCreated: number;
  failed: { rowNumber: number; errors: string[] }[];
};

// Ponto unico de verdade para a confirmacao de importacao: nunca confia nos
// valores ja "interpretados" que o cliente devolve depois da previa - refaz a
// validacao completa (mesma funcao usada na previa) e a checagem de
// duplicidade em cima do estado atual do banco antes de inserir qualquer
// coisa (secao 13: nada e salvo antes da confirmacao explicita).
//
// Categorias novas e lancamentos sao gravados na MESMA transacao (Etapa 3.1,
// item 6): se qualquer insercao falhar (ex.: um valor que so estoura um
// limite no banco, nao capturado na validacao em memoria), tudo e desfeito -
// nenhuma categoria nova fica orfa, nenhum lancamento fica parcialmente
// gravado.
export async function confirmImport(
  businessId: string,
  userId: string,
  currency: Currency,
  timeZone: TimeZone,
  rowsInput: ImportRowInput[],
  duplicateAction: DuplicateAction,
  categoryDecisions: CategoryDecision[] = []
): Promise<ConfirmImportResult> {
  const categories = await listVisibleCategories(businessId);

  const validated: ValidatedImportRow[] = rowsInput.map(({ rowNumber, ...raw }) =>
    validateImportRow(raw, rowNumber, categories, currency, timeZone)
  );

  const withDuplicateFlags = await markPotentialDuplicates(businessId, validated, timeZone);

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

  if (toInsert.length === 0) {
    return { inserted: 0, skippedDuplicates, categoriesCreated: 0, failed };
  }

  const decisionsByKey = new Map(categoryDecisions.map((d) => [d.key, d]));
  const newCategoryGroups = groupNewCategories(toInsert);

  let result: { inserted: number; categoriesCreated: number };
  try {
    result = await prisma.$transaction(async (tx) => {
    // Resolve cada grupo de categoria nova uma unica vez (nao uma vez por
    // linha), e reaproveita o resultado para todas as linhas do grupo.
    const resolvedCategoryIdByKey = new Map<string, string>();
    let categoriesCreated = 0;

    for (const group of newCategoryGroups) {
      const decision = decisionsByKey.get(group.key);

      if (decision?.action === "map") {
        const target = await tx.category.findFirst({
          where: {
            id: decision.mapToCategoryId,
            type: group.type,
            active: true,
            OR: [{ businessId: null }, { businessId }],
          },
        });
        if (target) {
          resolvedCategoryIdByKey.set(group.key, target.id);
          continue;
        }
        // Categoria de destino invalida/nao visivel para essa empresa: cai
        // para o comportamento padrao (criar) em vez de aceitar um id nao
        // verificado ou falhar a importacao inteira por causa disso.
      }

      const { category, created } = await findOrCreateCategoryInTx(tx, businessId, group.type, group.name);
      resolvedCategoryIdByKey.set(group.key, category.id);
      if (created) categoriesCreated += 1;
    }

    // O dia da planilha e a fonte do dia (Etapa F6a-2): a linha validada traz
    // 00:00 desse dia no fuso da empresa (importValidation), entao toDateKey
    // devolve exatamente o dia digitado.
    function entryDayFromRow(row: ValidatedImportRow) {
      const day = dayColumns({ day: toDateKey(row.occurredAt!, timeZone) }, timeZone);
      return { occurredAt: day.at, occurredOn: day.on };
    }

    function resolveCategoryId(row: ValidatedImportRow): string {
      if (row.categoryStatus === "existing") return row.categoryId!;
      const key = `${row.type}:${row.categoryNormalized}`;
      const resolved = resolvedCategoryIdByKey.get(key);
      if (!resolved) {
        // Nao deveria acontecer (todo row "new" valido tem um grupo
        // correspondente resolvido acima) - falha alto e explicito em vez
        // de gravar um lancamento sem categoria.
        throw new Error(`Categoria não resolvida para a linha ${row.rowNumber}.`);
      }
      return resolved;
    }

    await tx.financialEntry.createMany({
      data: toInsert.map((r) => ({
        ...entryDayFromRow(r),
        businessId,
        userId,
        type: r.type as FinancialEntryType,
        categoryId: resolveCategoryId(r),
        description: r.description,
        amount: new Decimal(r.amount!),
        notes: r.notes || null,
        source: "IMPORT" as const,
      })),
    });

      return { inserted: toInsert.length, categoriesCreated };
    });
  } catch {
    // A transacao inteira foi desfeita pelo Prisma (categorias novas e
    // lancamentos - nenhuma fica orfa, ver comentario acima). Nao vazamos o
    // erro cru do banco para o cliente; reportamos todas as linhas que
    // seriam inseridas como falhas, para o usuario poder tentar de novo.
    return {
      inserted: 0,
      skippedDuplicates,
      categoriesCreated: 0,
      failed: [
        ...failed,
        ...toInsert.map((r) => ({
          rowNumber: r.rowNumber,
          errors: ["Não foi possível gravar este lançamento no banco de dados."],
        })),
      ],
    };
  }

  return { ...result, skippedDuplicates, failed };
}
