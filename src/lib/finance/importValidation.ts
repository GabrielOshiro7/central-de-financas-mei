import type { Category, Currency, FinancialEntryType } from "@prisma/client";
import { isIntegerCurrency } from "@/lib/money";
import { normalizeCategoryName } from "@/lib/finance/categories";
import { parseImportEntryType } from "@/lib/finance/options";
import type { RawImportRow } from "@/lib/finance/importParsing";

export type ValidatedImportRow = {
  rowNumber: number; // numero da linha na planilha (cabecalho = 1)
  // Valores originais em texto, como vieram do arquivo - permite reexibir os
  // campos editaveis na previa (secao 12, etapa 8) sem perder o que o
  // usuario efetivamente digitou/importou.
  raw: { data: string; tipo: string; categoria: string; descricao: string; valor: string; observacao: string };
  type: FinancialEntryType | null;
  occurredAt: Date | null;
  description: string;
  categoryId: string | null;
  categoryName: string;
  amount: number | null;
  notes: string;
  errors: string[];
  isDuplicate: boolean;
};

// Tenta ISO (aaaa-mm-dd) e o formato comum de planilha BR (dd/mm/aaaa).
// Excel/CSV as vezes tambem manda a data-hora completa - so usamos a parte
// da data.
function parseFlexibleDate(raw: string): Date | null {
  const value = raw.trim();
  if (!value) return null;

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const brMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (date.getMonth() !== Number(m) - 1) return null; // ex.: 31/02 nao existe
    return date;
  }

  return null;
}

// Tolerante ao formato "50000", "50000.00" e ao formato BR "50.000,00" -
// decide qual dos dois separadores e o decimal pela ultima ocorrencia.
function parseFlexibleAmount(raw: string): number | null {
  let value = raw.trim().replace(/[^\d,.-]/g, "");
  if (!value) return null;

  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      value = value.replace(/\./g, "").replace(",", ".");
    } else {
      value = value.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    value = value.replace(",", ".");
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function validateImportRow(
  raw: RawImportRow,
  rowNumber: number,
  categories: Category[],
  currency: Currency
): ValidatedImportRow {
  const errors: string[] = [];

  const type = parseImportEntryType(raw.tipo ?? "");
  if (!type) errors.push("Tipo inválido.");

  const occurredAt = parseFlexibleDate(raw.data ?? "");
  if (!occurredAt) errors.push("Data inválida.");

  const description = (raw.descricao ?? "").trim();
  if (!description) errors.push("Descrição obrigatória.");

  const categoryRaw = (raw.categoria ?? "").trim();
  let categoryId: string | null = null;
  if (type) {
    const target = normalizeCategoryName(categoryRaw);
    const match = target
      ? categories.find((c) => c.type === type && normalizeCategoryName(c.name) === target)
      : undefined;
    categoryId = match?.id ?? null;
    if (!categoryId) errors.push("Categoria não encontrada.");
  } else {
    errors.push("Categoria não encontrada.");
  }

  const amount = parseFlexibleAmount(raw.valor ?? "");
  if (amount === null) {
    errors.push("Valor inválido.");
  } else if (amount <= 0) {
    errors.push("O valor precisa ser maior que zero.");
  } else if (isIntegerCurrency(currency) && !Number.isInteger(amount)) {
    errors.push("Valores em iene não têm casas decimais.");
  }

  return {
    rowNumber,
    raw: {
      data: raw.data ?? "",
      tipo: raw.tipo ?? "",
      categoria: raw.categoria ?? "",
      descricao: raw.descricao ?? "",
      valor: raw.valor ?? "",
      observacao: raw.observacao ?? "",
    },
    type,
    occurredAt,
    description,
    categoryId,
    categoryName: categoryRaw,
    amount,
    notes: (raw.observacao ?? "").trim(),
    errors,
    isDuplicate: false,
  };
}
