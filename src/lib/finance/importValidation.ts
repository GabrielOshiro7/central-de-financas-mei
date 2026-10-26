import type { Category, Currency, FinancialEntryType } from "@prisma/client";
import { isIntegerCurrency } from "@/lib/money";
import { normalizeCategoryName } from "@/lib/finance/categories";
import { parseImportEntryType } from "@/lib/finance/options";
import type { RawImportRow } from "@/lib/finance/importParsing";
import { isDateKey, startOfDayInstant, zonedInstant, type TimeZone } from "@/lib/time/zoned";

// "existing": nome bateu (tolerante a maiuscula/espaco/acento) com uma
// categoria ja visivel para a empresa - categoryId preenchido.
// "new": nome informado, mas nao bate com nenhuma categoria existente - NAO
// e mais um erro bloqueante (Etapa 3.1, "Categorias adaptaveis"); a linha
// fica valida e a categoria e criada (ou mapeada para uma existente, se o
// usuario escolher isso na previa) so na confirmacao.
// "missing": campo categoria vazio/ausente - esse sim continua bloqueando a
// linha, e o unico caso em que "categoria" gera erro.
export type CategoryMatchStatus = "existing" | "new" | "missing";

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
  categoryStatus: CategoryMatchStatus;
  categoryNormalized: string;
  amount: number | null;
  notes: string;
  errors: string[];
  isDuplicate: boolean;
};

// Tenta ISO (aaaa-mm-dd) e o formato comum de planilha BR (dd/mm/aaaa).
// Excel/CSV as vezes tambem manda a data-hora completa - so usamos a parte
// da data.
//
// Etapa F3c: a data e interpretada no FUSO DA EMPRESA (00:00 do dia no fuso
// dela), nunca no do processo. Antes era `new Date(ano, mes, dia)`, 00:00 no
// fuso do PROCESSO: para empresa em Asia/Tokyo com o servidor em Asia/Tokyo
// o instante gravado e exatamente o mesmo de antes (a representacao gravada
// so muda na F6).
function parseFlexibleDate(raw: string, timeZone: TimeZone): Date | null {
  const value = raw.trim();
  if (!value) return null;

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    // Mesmo comportamento de antes para componentes fora do intervalo: eles
    // normalizam (ex.: 2026-02-31 vira 03/03), como no construtor do Date.
    return zonedInstant(timeZone, Number(y), Number(m), Number(d));
  }

  const brMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    const key = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (!isDateKey(key)) return null; // ex.: 31/02 nao existe
    return startOfDayInstant(key, timeZone);
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
  currency: Currency,
  timeZone: TimeZone
): ValidatedImportRow {
  const errors: string[] = [];

  const type = parseImportEntryType(raw.tipo ?? "");
  if (!type) errors.push("Tipo inválido.");

  const occurredAt = parseFlexibleDate(raw.data ?? "", timeZone);
  if (!occurredAt) errors.push("Data inválida.");

  const description = (raw.descricao ?? "").trim();
  if (!description) errors.push("Descrição obrigatória.");

  // So bloqueia a linha se a categoria estiver vazia/ausente (Etapa 3.1,
  // item 3). Um nome preenchido que nao bate com nada existente vira "new" -
  // a categoria e criada (ou mapeada para uma ja existente) na confirmacao,
  // nunca durante a previa (nada e gravado antes da confirmacao explicita).
  const categoryRaw = (raw.categoria ?? "").trim();
  const categoryNormalized = normalizeCategoryName(categoryRaw);
  let categoryId: string | null = null;
  let categoryStatus: CategoryMatchStatus;

  if (!categoryNormalized) {
    categoryStatus = "missing";
    errors.push("Categoria obrigatória.");
  } else {
    const match = type
      ? categories.find((c) => c.type === type && c.normalizedName === categoryNormalized)
      : undefined;
    if (match) {
      categoryId = match.id;
      categoryStatus = "existing";
    } else {
      categoryStatus = "new";
    }
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
    categoryStatus,
    categoryNormalized,
    amount,
    notes: (raw.observacao ?? "").trim(),
    errors,
    isDuplicate: false,
  };
}
