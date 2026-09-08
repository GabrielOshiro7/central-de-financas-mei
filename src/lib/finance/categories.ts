import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Category, FinancialEntryType } from "@prisma/client";
import { normalizeCategoryName } from "@/lib/finance/categoryName";

export { normalizeCategoryName };

// Tipo minimo que qualquer "client" transacional do Prisma (tx dentro de um
// $transaction, ou o proprio prisma fora de uma) satisfaz para as operacoes
// de categoria usadas aqui.
type Db = Pick<typeof prisma, "category">;

// Categorias visiveis para uma empresa: as padrao do sistema (business_id
// nulo) + as proprias dela, sempre so as ativas. Opcionalmente filtradas por
// tipo (receita/custo/despesa).
export async function listVisibleCategories(
  businessId: string,
  type?: FinancialEntryType
): Promise<Category[]> {
  return prisma.category.findMany({
    where: {
      active: true,
      OR: [{ businessId: null }, { businessId }],
      ...(type ? { type } : {}),
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

// Busca tolerante por nome dentro do conjunto visivel para a empresa e do
// tipo informado (padrao do sistema + propria da empresa). Usado na
// validacao de lancamento manual e de importacao.
export async function resolveCategoryByName(
  businessId: string,
  type: FinancialEntryType,
  rawName: string
): Promise<Category | null> {
  const normalizedName = normalizeCategoryName(rawName);
  if (!normalizedName) return null;

  return prisma.category.findFirst({
    where: { type, active: true, normalizedName, OR: [{ businessId: null }, { businessId }] },
  });
}

export type CreateCategoryResult =
  | { ok: true; category: Category }
  | { ok: false; error: string };

// Cria uma categoria propria da empresa. Nao permite duplicar (tolerante a
// maiuscula/minuscula, espacos e acentos) uma categoria ja visivel para essa
// empresa do mesmo tipo, seja ela padrao do sistema ou outra categoria
// propria. A checagem previa (resolveCategoryByName) e so uma resposta de
// erro amigavel no caminho comum - a garantia de verdade contra corrida e a
// constraint UNIQUE(business_id, type, normalized_name) no banco, capturada
// abaixo caso duas requisicoes colidam entre a checagem e o create.
export async function createCustomCategory(
  businessId: string,
  type: FinancialEntryType,
  name: string
): Promise<CreateCategoryResult> {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return { ok: false, error: "Digite um nome para a categoria." };
  }

  const existing = await resolveCategoryByName(businessId, type, trimmed);
  if (existing) {
    return { ok: false, error: "Já existe uma categoria com esse nome." };
  }

  try {
    const category = await prisma.category.create({
      data: {
        businessId,
        type,
        name: trimmed,
        normalizedName: normalizeCategoryName(trimmed),
        isDefault: false,
        active: true,
      },
    });
    return { ok: true, category };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "Já existe uma categoria com esse nome." };
    }
    throw error;
  }
}

// Variante para uso dentro de uma transacao de importacao (secao 6 da Etapa
// 3.1): tenta criar; se outra linha da mesma importacao (ou uma importacao
// concorrente) ja criou a categoria com o mesmo nome normalizado entre a
// checagem e o create, o banco rejeita com P2002 - nesse caso, so buscamos e
// reaproveitamos a que ja existe, em vez de duplicar ou falhar a transacao
// inteira. `db` aceita tanto o prisma normal quanto o `tx` de um
// $transaction interativo.
export type FindOrCreateCategoryResult = { category: Category; created: boolean };

export async function findOrCreateCategoryInTx(
  db: Db,
  businessId: string,
  type: FinancialEntryType,
  name: string
): Promise<FindOrCreateCategoryResult> {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const normalizedName = normalizeCategoryName(trimmed);

  const existing = await db.category.findFirst({
    where: { type, active: true, normalizedName, OR: [{ businessId: null }, { businessId }] },
  });
  if (existing) return { category: existing, created: false };

  try {
    const category = await db.category.create({
      data: { businessId, type, name: trimmed, normalizedName, isDefault: false, active: true },
    });
    return { category, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raceWinner = await db.category.findFirst({
        where: { type, active: true, normalizedName, OR: [{ businessId: null }, { businessId }] },
      });
      if (raceWinner) return { category: raceWinner, created: false };
    }
    throw error;
  }
}
