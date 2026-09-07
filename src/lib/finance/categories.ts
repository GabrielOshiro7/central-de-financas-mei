import { prisma } from "@/lib/db";
import type { Category, FinancialEntryType } from "@prisma/client";

// Normaliza para comparacao tolerante a maiuscula/minuscula e espacos extras
// (secao 4: "buscar a categoria por nome de forma tolerante a
// maiusculas/minusculas e espacos extras").
export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

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
// tipo informado. Usado na validacao de lancamento manual e de importacao.
export async function resolveCategoryByName(
  businessId: string,
  type: FinancialEntryType,
  rawName: string
): Promise<Category | null> {
  const target = normalizeCategoryName(rawName);
  if (!target) return null;

  const candidates = await listVisibleCategories(businessId, type);
  return candidates.find((c) => normalizeCategoryName(c.name) === target) ?? null;
}

export type CreateCategoryResult =
  | { ok: true; category: Category }
  | { ok: false; error: string };

// Cria uma categoria propria da empresa. Nao permite duplicar (tolerante a
// maiuscula/minuscula e espacos) uma categoria ja visivel para essa empresa
// do mesmo tipo, seja ela padrao do sistema ou outra categoria propria.
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

  const category = await prisma.category.create({
    data: { businessId, type, name: trimmed, isDefault: false, active: true },
  });
  return { ok: true, category };
}
