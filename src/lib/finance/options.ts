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

// Texto do botão de criação de cada aba (Receitas/Custos/Despesas) e título
// do modal aberto por ele, com o tipo já fixo. Gênero concorda com o tipo.
export const NEW_ENTRY_LABELS: Record<FinancialEntryType, string> = {
  REVENUE: "Nova receita",
  COST: "Novo custo",
  EXPENSE: "Nova despesa",
};

// Selo de tipo do lançamento - SEMPRE neutro (cinza), como os selos de status
// da venda (src/lib/sales/options.ts) e da Agenda. Tipo de lançamento não é
// um dos 4 usos da paleta Musgo/Âmbar/Terracota (KPI, selo de status de
// pagamento, selo de prioridade de insight, linha de gráfico) - com ela,
// Receita/Custo/Despesa liam como "bom/atenção/crítico". Diferenciação por
// texto + borda/fundo, com o mesmo peso de texto nos três (nenhum tipo é mais
// importante que outro): receita com borda simples, custo preenchido, despesa
// tracejada. Compartilhado por TransactionTable e RecurringEntryTable; coberto
// por tests/unit/finance/entryTypeBadge.test.ts.
export const ENTRY_TYPE_BADGE_STYLE: Record<FinancialEntryType, string> = {
  REVENUE: "border border-gray-300 text-gray-700 dark:border-neutral-600 dark:text-neutral-300",
  COST: "border border-gray-300 bg-gray-100 text-gray-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  EXPENSE: "border border-dashed border-gray-400 text-gray-700 dark:border-neutral-500 dark:text-neutral-300",
};

export const SOURCE_LABELS: Record<EntrySource, string> = {
  MANUAL: "Manual",
  IMPORT: "Importado",
  RECURRING: "Recorrente",
  // Lancamento gerado pela confirmacao de pagamento/recebimento de uma Bill
  // (Etapa 5) - ver settleBill em bills/mutations.ts.
  BILL: "Conta paga/recebida",
};

export const SOURCE_OPTIONS: { value: EntrySource; label: string }[] = [
  { value: "MANUAL", label: "Manual" },
  { value: "IMPORT", label: "Importado" },
  { value: "RECURRING", label: "Recorrente" },
  { value: "BILL", label: "Conta paga/recebida" },
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
