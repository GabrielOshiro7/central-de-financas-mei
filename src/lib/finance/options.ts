import type { EntrySource, FinancialEntryType } from "@prisma/client";

export const ENTRY_TYPE_OPTIONS: { value: FinancialEntryType; label: string }[] = [
  { value: "REVENUE", label: "Receita" },
  { value: "COST", label: "Custo" },
  { value: "EXPENSE", label: "Despesa" },
];

export const ENTRY_TYPE_LABELS: Record<FinancialEntryType, string> = {
  REVENUE: "Receita",
  COST: "Custo",
  EXPENSE: "Despesa",
};

export const SOURCE_LABELS: Record<EntrySource, string> = {
  MANUAL: "Manual",
  IMPORT: "Importado",
  RECURRING: "Recorrente",
};

export const SOURCE_OPTIONS: { value: EntrySource; label: string }[] = [
  { value: "MANUAL", label: "Manual" },
  { value: "IMPORT", label: "Importado" },
  { value: "RECURRING", label: "Recorrente" },
];

// Aceita variacoes comuns de como o tipo pode vir escrito em uma planilha
// (acentuado ou nao, maiuscula/minuscula, singular). Usado so na importacao -
// o formulario manual sempre envia o enum direto (REVENUE/COST/EXPENSE).
const IMPORT_TYPE_ALIASES: Record<string, FinancialEntryType> = {
  receita: "REVENUE",
  receitas: "REVENUE",
  revenue: "REVENUE",
  custo: "COST",
  custos: "COST",
  cost: "COST",
  despesa: "EXPENSE",
  despesas: "EXPENSE",
  expense: "EXPENSE",
};

export function parseImportEntryType(raw: string): FinancialEntryType | null {
  const key = raw.trim().toLowerCase();
  return IMPORT_TYPE_ALIASES[key] ?? null;
}
