import { addMonthsClamped, isDateKey, type DateKey } from "@/lib/time/zoned";

// Parcelas MENSAIS do agendamento por dia (Agenda): a parcela N vence N-1
// meses depois da primeira, no MESMO dia do mes, sempre a partir do dia
// ORIGINAL da primeira (31/01 -> 28/02 -> 31/03 -> 30/04; nunca encadeando
// "mes anterior + 1"), usando o ultimo dia do mes quando ele nao tem aquele
// dia (addMonthsClamped, aritmetica pura de calendario - sem fuso).
export type MonthlyInstallmentRow = { dueDateInput: string; amount: string };

export function monthlyDueDates(firstDue: DateKey, count: number): DateKey[] {
  return Array.from({ length: Math.max(1, count) }, (_, index) => addMonthsClamped(firstDue, index));
}

// Divisao igual em unidades MINIMAS da moeda (JPY: inteiro; BRL: centavos):
// cada parcela = floor(total / n); a SOBRA fica na ULTIMA, de modo que a soma
// e exatamente o total (12.000 / 7 em JPY -> 6 x 1.714 e 1.716; 100,00 / 3 em
// BRL -> 33,33 / 33,33 / 33,34). Trabalha em inteiros - sem erro de ponto
// flutuante na soma.
export function splitEqualAmounts(total: number, count: number, decimals: number): string[] {
  const n = Math.max(1, Math.floor(count));
  const factor = 10 ** decimals;
  const totalUnits = Math.round(total * factor);
  const base = Math.floor(totalUnits / n);
  const last = totalUnits - base * (n - 1);
  return Array.from({ length: n }, (_, index) => String((index === n - 1 ? last : base) / factor));
}

export function buildMonthlyInstallments(total: number, count: number, firstDue: string, decimals: number): MonthlyInstallmentRow[] {
  const amounts = splitEqualAmounts(total, count, decimals);
  const dates = isDateKey(firstDue) ? monthlyDueDates(firstDue, amounts.length) : null;
  return amounts.map((amount, index) => ({ dueDateInput: dates ? dates[index] : firstDue, amount }));
}

// Muda so as datas (a 1a mudou): a parcela 1 recebe a data nova e as demais
// vencem 1, 2, ... meses depois dela; os valores ficam como estao.
export function rebaseMonthlyDates<T extends MonthlyInstallmentRow>(rows: T[], firstDue: DateKey): T[] {
  return rows.map((row, index) => ({ ...row, dueDateInput: addMonthsClamped(firstDue, index) }));
}

// Soma (em unidades minimas) das parcelas == total?
export function installmentsMatchTotal(rows: MonthlyInstallmentRow[], total: number, decimals: number): boolean {
  const factor = 10 ** decimals;
  const sum = rows.reduce((t, r) => t + Math.round((Number(r.amount) || 0) * factor), 0);
  return rows.every((r) => r.amount !== "") && sum === Math.round(total * factor);
}
