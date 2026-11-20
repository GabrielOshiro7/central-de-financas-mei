import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { summarizeEntries } from "@/lib/finance/calculations";
import { calculateAccumulatedBalance, type CashEntryLike } from "@/lib/finance/cash/calculations";
import { ENTRY_TYPE_LABELS, ENTRY_TYPE_OPTIONS, NEW_ENTRY_LABELS, parseImportEntryType } from "@/lib/finance/options";
import { transactionSchema } from "@/lib/finance/schema";
import { DEFAULT_CATEGORY_NAMES } from "@/lib/finance/categoryDefaults";
import { normalizeCategoryName } from "@/lib/finance/categoryName";
import { recurringEntrySchema } from "@/lib/finance/recurring/schema";

const { Decimal } = Prisma;

// Remocao do tipo "Custo" (migracao 20261120120000_remove_cost_type): tudo o que era custo virou despesa.
// Estes testes provam que o LUCRO LIQUIDO e o TOTAL DO CAIXA de um conjunto de dados ANTIGO (com o que era
// custo) sao iguais antes e depois da conversao, e que o tipo/rotulo/apelido de importacao se comportam.

type OldType = "REVENUE" | "COST" | "EXPENSE";
type OldEntry = { type: OldType; amount: number; occurredOn: string };

// Os mesmos numeros da Academia Gabriel em nov/2026 (receita 101.000; custos 92.000; despesas 35.000)
// mais uma data anterior ao saldo inicial.
const OLD_DATA: OldEntry[] = [
  { type: "REVENUE", amount: 60000, occurredOn: "2026-11-03" },
  { type: "REVENUE", amount: 41000, occurredOn: "2026-11-10" },
  { type: "COST", amount: 50000, occurredOn: "2026-11-04" },
  { type: "COST", amount: 42000, occurredOn: "2026-11-12" },
  { type: "EXPENSE", amount: 20000, occurredOn: "2026-11-05" },
  { type: "EXPENSE", amount: 15000, occurredOn: "2026-11-15" },
  { type: "COST", amount: 9999, occurredOn: "2026-10-01" }, // antes do saldo inicial: nao entra no caixa
];

// Formula ANTIGA, escrita a mao aqui (nao importada): lucro = receita - custos - despesas.
function legacyNetProfit(entries: OldEntry[]): number {
  const sum = (t: OldType) => entries.filter((e) => e.type === t).reduce((a, e) => a + e.amount, 0);
  return sum("REVENUE") - sum("COST") - sum("EXPENSE");
}

// A conversao da migracao: COST -> EXPENSE.
function converted(entries: OldEntry[]) {
  return entries.map((e) => ({ type: e.type === "COST" ? ("EXPENSE" as const) : e.type, amount: new Decimal(e.amount), occurredOn: e.occurredOn }));
}

describe("remocao do tipo Custo: o lucro liquido e o caixa nao mudam", () => {
  it("lucro líquido antes (receita − custos − despesas) = depois (receita − despesas)", () => {
    const inNovember = OLD_DATA.filter((e) => e.occurredOn.startsWith("2026-11"));
    const before = legacyNetProfit(inNovember);
    expect(before).toBe(-26000); // Academia Gabriel, novembro: 101.000 − 92.000 − 35.000

    const after = summarizeEntries(converted(inNovember));
    expect(after.netProfit.toNumber()).toBe(before);
    expect(after.revenue.toNumber()).toBe(101000);
    expect(after.expenses.toNumber()).toBe(127000); // 92.000 (ex-custos) + 35.000
    expect(after.netMargin?.toNumber()).toBeCloseTo((before / 101000) * 100, 10);
  });

  it("total do Caixa antes = depois, com o mesmo saldo inicial e a mesma data de corte", () => {
    const opening = new Decimal(300000);
    const openingDay = "2026-10-15";
    const legacyBalance = opening.toNumber() + legacyNetProfit(OLD_DATA.filter((e) => e.occurredOn > openingDay));

    const entries: CashEntryLike[] = converted(OLD_DATA);
    const balance = calculateAccumulatedBalance(opening, openingDay, entries);

    expect(balance.toNumber()).toBe(legacyBalance);
    expect(balance.toNumber()).toBe(274000); // 300.000 − 26.000
  });

  it("a conversão não muda a soma de lançamentos de saída (custos + despesas = despesas)", () => {
    const out = OLD_DATA.filter((e) => e.type !== "REVENUE").reduce((a, e) => a + e.amount, 0);
    const after = summarizeEntries(converted(OLD_DATA));
    expect(after.expenses.toNumber()).toBe(out);
  });
});

describe("tipo Custo removido: rótulos, opções e validação", () => {
  it("só há Receita e Despesa nas opções, rótulos e botões", () => {
    expect(ENTRY_TYPE_OPTIONS.map((o) => o.value)).toEqual(["REVENUE", "EXPENSE"]);
    expect(Object.keys(ENTRY_TYPE_LABELS).sort()).toEqual(["EXPENSE", "REVENUE"]);
    expect(Object.keys(NEW_ENTRY_LABELS).sort()).toEqual(["EXPENSE", "REVENUE"]);
    expect(Object.values(ENTRY_TYPE_LABELS).join(" ")).not.toMatch(/custo/i);
  });

  it("o schema do lançamento recusa COST e aceita REVENUE/EXPENSE", () => {
    const base = { occurredAt: "2026-11-10", description: "Teste", categoryId: "cat-1", amount: 100 };
    const schema = transactionSchema(null);
    expect(schema.safeParse({ ...base, type: "COST" }).success).toBe(false);
    expect(schema.safeParse({ ...base, type: "EXPENSE" }).success).toBe(true);
    expect(schema.safeParse({ ...base, type: "REVENUE" }).success).toBe(true);
  });

  it("o schema de recorrente recusa COST", () => {
    const base = { description: "Teste", categoryId: "cat-1", amount: 100, frequency: "MONTHLY", startDate: "2026-11-10", dayOfMonth: 10 };
    const schema = recurringEntrySchema(null);
    expect(schema.safeParse({ ...base, type: "EXPENSE" }).success).toBe(true); // base valida
    expect(schema.safeParse({ ...base, type: "COST" }).success).toBe(false);
  });
});

describe("importação: 'custo' e 'custos' continuam aceitos como apelidos de despesa (planilhas antigas)", () => {
  it.each(["custo", "custos", "Custo", "CUSTOS", "  custo  "])("'%s' vira despesa", (raw) => {
    expect(parseImportEntryType(raw)).toBe("EXPENSE");
  });

  it("receita e despesa continuam como antes", () => {
    expect(parseImportEntryType("receita")).toBe("REVENUE");
    expect(parseImportEntryType("Despesas")).toBe("EXPENSE");
  });

  it("nenhum outro valor novo é aceito", () => {
    for (const raw of ["", "investimento", "custo fixo", "gasto", "imposto"]) {
      expect(parseImportEntryType(raw), raw).toBeNull();
    }
  });
});

describe("categorias padrão (empresas novas)", () => {
  it("só há receita e despesa, sem 'Outros custos', e nenhum nome se repete", () => {
    expect(Object.keys(DEFAULT_CATEGORY_NAMES).sort()).toEqual(["EXPENSE", "REVENUE"]);
    const all = Object.values(DEFAULT_CATEGORY_NAMES).flat();
    expect(all).not.toContain("Outros custos");
    expect(DEFAULT_CATEGORY_NAMES.EXPENSE).toContain("Outras despesas");
    for (const name of ["Mercadoria", "Matéria-prima", "Insumos", "Embalagens", "Frete", "Comissões"]) {
      expect(DEFAULT_CATEGORY_NAMES.EXPENSE).toContain(name); // as ex-custo continuam como despesa
    }
    const normalized = all.map((n) => normalizeCategoryName(n));
    expect(new Set(normalized).size).toBe(normalized.length);
  });
});
