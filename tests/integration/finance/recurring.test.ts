import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import {
  createRecurringEntry,
  updateRecurringEntry,
  setRecurringEntryActive,
  deleteRecurringEntry,
} from "@/lib/finance/recurring/mutations";
import { materializeRecurringEntries } from "@/lib/finance/recurring/materialize";
import { generateOccurrencesForEntry } from "@/lib/finance/recurring/occurrences";
import { getFinancialSummaryForRange, listTransactions } from "@/lib/finance/queries";
import { updateBusinessProfile, type BusinessEditInput } from "@/lib/onboarding/businessMutations";
import { PROCESS_TZ } from "../../helpers/processClock";

function sumAmounts(items: { amount: { toNumber: () => number } }[]): number {
  return items.reduce((total, item) => total + item.amount.toNumber(), 0);
}

describe("lançamentos recorrentes (Etapa 4.1)", () => {
  let userId: string;
  let businessId: string;
  let revenueCategoryId: string;
  let costCategoryId: string;
  let expenseCategoryId: string;

  beforeAll(async () => {
    const [revenueCategory, costCategory, expenseCategory] = await Promise.all([
      prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } }),
      prisma.category.findFirstOrThrow({ where: { businessId: null, type: "COST" } }),
      prisma.category.findFirstOrThrow({ where: { businessId: null, type: "EXPENSE" } }),
    ]);
    revenueCategoryId = revenueCategory.id;
    costCategoryId = costCategory.id;
    expenseCategoryId = expenseCategory.id;

    const user = await prisma.user.create({
      data: {
        name: "Teste Recorrência",
        email: `recorrencia-${Date.now()}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    userId = user.id;

    const business = await prisma.business.create({
      // Fuso da empresa = fuso do processo (mesma convencao de
      // tests/helpers/processClock.ts): este arquivo monta datas e periodos com
      // o construtor local do Date. Desde a F5 a materializacao usa o fuso da
      // EMPRESA, entao os dois precisam coincidir para o contrato continuar o
      // mesmo em qualquer TZ da matriz.
      data: { userId, name: "Empresa Recorrência", currency: "BRL", timezone: PROCESS_TZ },
    });
    businessId = business.id;
  });

  // Cada teste parte de um estado limpo pra essa empresa - evita acoplamento
  // de ordem entre os testes (varios criam moldes e materializam).
  beforeEach(async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.recurringEntry.deleteMany({ where: { businessId } });
  });

  afterAll(async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.recurringEntry.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  it("rejeita categoryId com type diferente do type do molde", async () => {
    const result = await createRecurringEntry(businessId, {
      type: "EXPENSE",
      categoryId: costCategoryId, // categoria de COST, molde de EXPENSE
      description: "Categoria incompatível",
      amount: 100,
      frequency: "MONTHLY",
      dayOfMonth: 5,
      startDate: new Date(2026, 0, 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/não é compatível/i);

    const count = await prisma.recurringEntry.count({ where: { businessId } });
    expect(count).toBe(0);
  });

  it("duas materializações simultâneas não duplicam nem lançam erro", async () => {
    const molde = await createRecurringEntry(businessId, {
      type: "EXPENSE",
      categoryId: expenseCategoryId,
      description: "Aluguel recorrente",
      amount: 500,
      frequency: "MONTHLY",
      dayOfMonth: 5,
      startDate: new Date(2025, 0, 1),
    });
    expect(molde.ok).toBe(true);
    if (!molde.ok) return;

    const uptoDate = new Date(2026, 8, 30);
    const expectedCount = generateOccurrencesForEntry(
      { frequency: "MONTHLY", dayOfWeek: null, dayOfMonth: 5, yearMonth: null, startDate: new Date(2025, 0, 1), endDate: null },
      uptoDate,
      PROCESS_TZ // fuso da empresa criada acima
    ).length;

    const [r1, r2] = await Promise.all([
      materializeRecurringEntries(businessId, userId, uptoDate),
      materializeRecurringEntries(businessId, userId, uptoDate),
    ]);

    // As duas chamadas juntas nunca criam mais linhas do que o esperado -
    // skipDuplicates garante que a segunda nao duplica o que a primeira
    // (ou uma corrida entre as duas) ja inseriu.
    expect(r1.created + r2.created).toBe(expectedCount);

    const entries = await prisma.financialEntry.findMany({ where: { recurringEntryId: molde.value.id } });
    expect(entries).toHaveLength(expectedCount);
    expect(entries.every((e) => e.source === "RECURRING")).toBe(true);

    // Rodar de novo (uma terceira vez) nao adiciona nada a mais.
    const r3 = await materializeRecurringEntries(businessId, userId, uptoDate);
    expect(r3.created).toBe(0);
    const entriesAfter = await prisma.financialEntry.findMany({ where: { recurringEntryId: molde.value.id } });
    expect(entriesAfter).toHaveLength(expectedCount);
  });

  it("mudança de amount não altera ocorrências já materializadas, só as futuras", async () => {
    const molde = await createRecurringEntry(businessId, {
      type: "REVENUE",
      categoryId: revenueCategoryId,
      description: "Assinatura mensal",
      amount: 100,
      frequency: "MONTHLY",
      dayOfMonth: 1,
      startDate: new Date(2026, 0, 1),
    });
    expect(molde.ok).toBe(true);
    if (!molde.ok) return;

    await materializeRecurringEntries(businessId, userId, new Date(2026, 2, 1)); // Jan1, Fev1, Mar1 = 100

    const update = await updateRecurringEntry(businessId, molde.value.id, {
      type: "REVENUE",
      categoryId: revenueCategoryId,
      description: "Assinatura mensal",
      amount: 200,
      frequency: "MONTHLY",
      dayOfMonth: 1,
      startDate: new Date(2026, 0, 1),
    });
    expect(update.ok).toBe(true);

    await materializeRecurringEntries(businessId, userId, new Date(2026, 3, 1)); // + Abr1 = 200

    const entries = await prisma.financialEntry.findMany({
      where: { recurringEntryId: molde.value.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(entries).toHaveLength(4);
    expect(entries.slice(0, 3).map((e) => e.amount.toNumber())).toEqual([100, 100, 100]);
    expect(entries[3].amount.toNumber()).toBe(200);
  });

  it("endDate interrompe a geração a partir da ocorrência seguinte a ela", async () => {
    const molde = await createRecurringEntry(businessId, {
      type: "EXPENSE",
      categoryId: expenseCategoryId,
      description: "Contrato temporário",
      amount: 300,
      frequency: "MONTHLY",
      dayOfMonth: 1,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 2, 1),
    });
    expect(molde.ok).toBe(true);
    if (!molde.ok) return;

    await materializeRecurringEntries(businessId, userId, new Date(2026, 5, 30));

    const entries = await prisma.financialEntry.findMany({ where: { recurringEntryId: molde.value.id } });
    expect(entries).toHaveLength(3); // Jan1, Fev1, Mar1 - nada depois
  });

  it("pausar (isActive=false) impede novas ocorrências, preservando as antigas", async () => {
    const molde = await createRecurringEntry(businessId, {
      type: "EXPENSE",
      categoryId: expenseCategoryId,
      description: "Serviço pausável",
      amount: 150,
      frequency: "MONTHLY",
      dayOfMonth: 1,
      startDate: new Date(2026, 0, 1),
    });
    expect(molde.ok).toBe(true);
    if (!molde.ok) return;

    await materializeRecurringEntries(businessId, userId, new Date(2026, 1, 28)); // Jan1, Fev1 = 2

    const pause = await setRecurringEntryActive(businessId, molde.value.id, false);
    expect(pause.ok).toBe(true);

    await materializeRecurringEntries(businessId, userId, new Date(2026, 5, 30)); // pausado - nada novo

    const entries = await prisma.financialEntry.findMany({ where: { recurringEntryId: molde.value.id } });
    expect(entries).toHaveLength(2);
  });

  it("excluir o molde desvincula (não apaga) os FinancialEntry já gerados", async () => {
    const molde = await createRecurringEntry(businessId, {
      type: "REVENUE",
      categoryId: revenueCategoryId,
      description: "Molde a ser excluído",
      amount: 80,
      frequency: "WEEKLY",
      dayOfWeek: 1,
      startDate: new Date(2026, 0, 5),
    });
    expect(molde.ok).toBe(true);
    if (!molde.ok) return;

    await materializeRecurringEntries(businessId, userId, new Date(2026, 0, 26));
    const before = await prisma.financialEntry.findMany({ where: { recurringEntryId: molde.value.id } });
    expect(before.length).toBeGreaterThan(0);

    const del = await deleteRecurringEntry(businessId, molde.value.id);
    expect(del.ok).toBe(true);

    const after = await prisma.financialEntry.findMany({ where: { id: { in: before.map((e) => e.id) } } });
    expect(after).toHaveLength(before.length); // continuam existindo
    expect(after.every((e) => e.recurringEntryId === null)).toBe(true); // so desvinculados
    expect(after.every((e) => e.description === "Molde a ser excluído")).toBe(true);

    const moldeGone = await prisma.recurringEntry.findUnique({ where: { id: molde.value.id } });
    expect(moldeGone).toBeNull();
  });

  it("bloqueia troca de moeda por RecurringEntry ativo mesmo sem nenhuma ocorrência materializada", async () => {
    const freshUser = await prisma.user.create({
      data: {
        name: "Teste Trava Recorrência",
        email: `trava-recorrencia-${Date.now()}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    const freshBusiness = await prisma.business.create({
      data: { userId: freshUser.id, name: "Empresa Trava Recorrência", currency: "BRL" },
    });

    const molde = await createRecurringEntry(freshBusiness.id, {
      type: "EXPENSE",
      categoryId: expenseCategoryId,
      description: "Molde recém-criado, nunca materializado",
      amount: 400,
      frequency: "MONTHLY",
      dayOfMonth: 10,
      startDate: new Date(2030, 0, 1), // no futuro - nao gera ocorrencia nenhuma hoje
    });
    expect(molde.ok).toBe(true);

    // Confirma a premissa do teste: zero FinancialEntry pra essa empresa.
    const entryCount = await prisma.financialEntry.count({ where: { businessId: freshBusiness.id } });
    expect(entryCount).toBe(0);

    const input: BusinessEditInput = {
      name: "Empresa Trava Recorrência",
      yearsInBusiness: "DE_1_A_3_ANOS",
      employeeCount: 2,
      currency: "USD",
      averageMonthlyRevenue: 500,
    };
    const result = await updateBusinessProfile(freshUser.id, input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/moeda/i);

    await prisma.recurringEntry.deleteMany({ where: { businessId: freshBusiness.id } });
    await prisma.business.delete({ where: { id: freshBusiness.id } });
    await prisma.user.delete({ where: { id: freshUser.id } });
  });

  it("isolamento: materializar a empresa A nunca gera nem lê recorrências da empresa B", async () => {
    const userB = await prisma.user.create({
      data: {
        name: "Teste Recorrência B",
        email: `recorrencia-b-${Date.now()}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    const businessB = await prisma.business.create({
      data: { userId: userB.id, name: "Empresa Recorrência B", currency: "BRL" },
    });

    const moldeA = await createRecurringEntry(businessId, {
      type: "REVENUE",
      categoryId: revenueCategoryId,
      description: "Molde A",
      amount: 111,
      frequency: "MONTHLY",
      dayOfMonth: 1,
      startDate: new Date(2026, 0, 1),
    });
    const moldeB = await createRecurringEntry(businessB.id, {
      type: "REVENUE",
      categoryId: revenueCategoryId,
      description: "Molde B",
      amount: 222,
      frequency: "MONTHLY",
      dayOfMonth: 1,
      startDate: new Date(2026, 0, 1),
    });
    expect(moldeA.ok).toBe(true);
    expect(moldeB.ok).toBe(true);
    if (!moldeA.ok || !moldeB.ok) return;

    await materializeRecurringEntries(businessId, userId, new Date(2026, 1, 28));

    const entriesForA = await prisma.financialEntry.findMany({ where: { businessId } });
    expect(entriesForA.every((e) => e.recurringEntryId !== moldeB.value.id)).toBe(true);
    expect(entriesForA.every((e) => e.amount.toNumber() === 111)).toBe(true);

    const entriesForB = await prisma.financialEntry.findMany({ where: { businessId: businessB.id } });
    expect(entriesForB).toHaveLength(0); // B nunca foi materializada

    await prisma.recurringEntry.deleteMany({ where: { businessId: businessB.id } });
    await prisma.financialEntry.deleteMany({ where: { businessId: businessB.id } });
    await prisma.business.delete({ where: { id: businessB.id } });
    await prisma.user.delete({ where: { id: userB.id } });
  });

  it("consistência cruzada: totais do dashboard/financeiro batem com lançamentos recorrentes materializados (as três frequências)", async () => {
    const monthly = await createRecurringEntry(businessId, {
      type: "EXPENSE",
      categoryId: expenseCategoryId,
      description: "Aluguel mensal",
      amount: 500,
      frequency: "MONTHLY",
      dayOfMonth: 1,
      startDate: new Date(2026, 0, 1),
    });
    const weekly = await createRecurringEntry(businessId, {
      type: "REVENUE",
      categoryId: revenueCategoryId,
      description: "Assinatura semanal",
      amount: 50,
      frequency: "WEEKLY",
      dayOfWeek: 1,
      startDate: new Date(2026, 0, 5),
    });
    const yearly = await createRecurringEntry(businessId, {
      type: "COST",
      categoryId: costCategoryId,
      description: "Licença anual",
      amount: 1200,
      frequency: "YEARLY",
      yearMonth: 0,
      dayOfMonth: 15,
      startDate: new Date(2026, 0, 1),
    });
    expect(monthly.ok && weekly.ok && yearly.ok).toBe(true);

    const uptoDate = new Date(2026, 2, 31); // materializa até 31/mar/2026
    await materializeRecurringEntries(businessId, userId, uptoDate);

    const range = { start: new Date(2026, 0, 1), end: new Date(2026, 3, 1) }; // jan-mar/2026
    const summary = await getFinancialSummaryForRange(businessId, range);

    const [revenueTx, costTx, expenseTx] = await Promise.all([
      listTransactions(businessId, { type: "REVENUE", range, pageSize: 100 }),
      listTransactions(businessId, { type: "COST", range, pageSize: 100 }),
      listTransactions(businessId, { type: "EXPENSE", range, pageSize: 100 }),
    ]);

    expect(summary.revenue.toNumber()).toBe(sumAmounts(revenueTx.items));
    expect(summary.costs.toNumber()).toBe(sumAmounts(costTx.items));
    expect(summary.expenses.toNumber()).toBe(sumAmounts(expenseTx.items));

    // Confere os valores absolutos tambem, nao so a consistencia entre os
    // dois caminhos de leitura (poderiam concordar e ainda assim estar
    // ambos errados).
    expect(summary.expenses.toNumber()).toBe(500 * 3); // Jan1, Fev1, Mar1
    expect(summary.costs.toNumber()).toBe(1200); // so 15/jan/2026 cai no range
    // Segundas-feiras de 05/jan a 30/mar/2026 (start 05/jan, passo de 7 dias,
    // ultima <= uptoDate 31/mar): (89-5)/7 + 1 = 13 ocorrencias.
    expect(revenueTx.items).toHaveLength(13);
  });
});
