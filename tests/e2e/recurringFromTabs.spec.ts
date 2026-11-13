import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { gotoHydrated } from "./helpers/hydration";
import { fillMoney } from "./helpers/money";
import { businessToday } from "./helpers/businessDate";
import { assertTestDatabase, loadTestEnv } from "../testEnv";
import { addMonthsClamped, dbDateToKey, formatDateKey } from "../../src/lib/time/zoned";

// Lancamento RECORRENTE criado a partir das abas Receitas/Custos/Despesas: o
// usuario FICA na aba; ocorrencias ja devidas aparecem na lista com o selo
// "Recorrente"; primeira ocorrencia futura => aviso na propria aba.
loadTestEnv();
assertTestDatabase();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const PASSWORD = "SenhaValida123";

async function registerAndOnboard(page: Page, email: string) {
  await gotoHydrated(page, "/register");
  await page.getByLabel("Nome").fill("Dono Recorrente Abas");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmar senha").fill(PASSWORD);
  await page.getByLabel(/Li e aceito/).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Loja", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Venda de produtos", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Nome da empresa").fill("Empresa Recorrente Abas");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "1 a 3 anos", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Número de pessoas").fill("5");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /BRL/ }).click();
  await fillMoney(page.getByLabel("Valor médio mensal"), "10000");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Ir para o dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function createRecurring(page: Page, tab: string, button: string, description: string, startDate: string) {
  await gotoHydrated(page, `/financeiro/${tab}`);
  await page.getByRole("button", { name: button }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Recorrente").check();
  await dialog.getByLabel("Data de início").fill(startDate);
  // O dia do mes segue a data de inicio (nao o antigo padrao "dia 1").
  await expect(dialog.getByLabel("Dia do mês")).toHaveValue(String(Number(startDate.slice(8, 10))));
  await dialog.getByLabel("Descrição").fill(description);
  await dialog.getByLabel("Categoria").selectOption({ index: 1 });
  await fillMoney(dialog.getByLabel("Valor"), "100");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(dialog).toHaveCount(0);
}

async function entriesOf(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { business: true } });
  const entries = await prisma.financialEntry.findMany({ where: { businessId: user.business!.id }, orderBy: { occurredOn: "asc" } });
  const recurring = await prisma.recurringEntry.findMany({ where: { businessId: user.business!.id } });
  return { entries, recurring };
}

const email = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;

test.describe("recorrente criado a partir das abas", () => {
  test("Receitas (a) início hoje: fica na aba; a ocorrência de hoje aparece com o selo; recarregar não duplica", async ({ page }) => {
    test.setTimeout(90_000);
    const mail = email("rec-hoje");
    await registerAndOnboard(page, mail);
    const today = businessToday();

    await createRecurring(page, "receitas", "Nova receita", "Mensalidade Hoje E2E", today);
    await expect(page).toHaveURL(/\/financeiro\/receitas/);
    const row = page.getByRole("row", { name: /Mensalidade Hoje E2E/ });
    await expect(row).toBeVisible();
    await expect(row.getByText(formatDateKey(today))).toBeVisible();
    await expect(row.getByText("Recorrente", { exact: true })).toBeVisible();
    await expect(page.getByTestId("recurring-created-notice")).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("row", { name: /Mensalidade Hoje E2E/ })).toHaveCount(1);
    const { entries, recurring } = await entriesOf(mail);
    expect(recurring).toHaveLength(1);
    expect(entries.map((e) => [e.type, e.source, dbDateToKey(e.occurredOn)])).toEqual([["REVENUE", "RECURRING", today]]);

    // A aba Recorrentes continua mostrando o molde.
    await gotoHydrated(page, "/financeiro/recorrentes");
    await expect(page.getByText("Mensalidade Hoje E2E")).toBeVisible();
  });

  test("Receitas (b) início há 3 meses: o período continua Este mês; o aviso traz a contagem e o intervalo; Ver todos mostra as 4 ocorrências", async ({ page }) => {
    test.setTimeout(90_000);
    const mail = email("rec-passado");
    await registerAndOnboard(page, mail);
    const today = businessToday();
    const start = addMonthsClamped(today, -3);

    await createRecurring(page, "receitas", "Nova receita", "Assinatura Passado E2E", start);

    // Fica na aba, sem trocar o filtro de período (nenhum ?period= na URL).
    await expect(page).toHaveURL(/\/financeiro\/receitas$/);
    await expect(page.locator("#filter-period")).toHaveValue("THIS_MONTH");
    const { entries } = await entriesOf(mail);
    expect(entries).toHaveLength(4);
    expect(entries.every((e) => e.source === "RECURRING" && e.type === "REVENUE")).toBe(true);
    expect(dbDateToKey(entries[0].occurredOn)).toBe(start);
    const last = dbDateToKey(entries[3].occurredOn);

    // O aviso diz o que foi criado e que a lista mostra so o período atual.
    const notice = page.getByTestId("recurring-created-notice");
    await expect(notice).toContainText(
      `4 lançamentos criados, de ${formatDateKey(start)} a ${formatDateKey(last)}. Mostrando o período atual.`
    );
    const rows = page.getByRole("row", { name: /Assinatura Passado E2E/ });
    await expect(rows).toHaveCount(1); // só a do mês corrente
    await expect(rows.first().getByText("Recorrente", { exact: true })).toBeVisible();

    // "Ver todos" aplica o período personalizado só ao ser clicado.
    await notice.getByRole("link", { name: "Ver todos" }).click();
    await expect(page).toHaveURL(new RegExp(`period=CUSTOM&start=${start}&end=${today}`));
    await expect(rows).toHaveCount(4);
    for (let i = 0; i < 4; i++) await expect(rows.nth(i).getByText("Recorrente", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("row", { name: /Assinatura Passado E2E/ })).toHaveCount(4);
    expect((await entriesOf(mail)).entries).toHaveLength(4); // sem duplicatas
  });

  test("Receitas (c) início no futuro: aviso com a data da primeira + link; a lista não muda; recarregar não gera nada", async ({ page }) => {
    test.setTimeout(90_000);
    const mail = email("rec-futuro");
    await registerAndOnboard(page, mail);
    const start = businessToday(10);

    await createRecurring(page, "receitas", "Nova receita", "Aluguel Futuro E2E", start);
    await expect(page).toHaveURL(/\/financeiro\/receitas/);
    const notice = page.getByTestId("recurring-created-notice");
    await expect(notice).toContainText(`Receita recorrente criada. A primeira entra em ${formatDateKey(start)}.`);
    await expect(page.getByRole("row", { name: /Aluguel Futuro E2E/ })).toHaveCount(0);
    await expect(page.getByText("Nenhum lançamento encontrado")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("row", { name: /Aluguel Futuro E2E/ })).toHaveCount(0);
    const { entries, recurring } = await entriesOf(mail);
    expect([entries.length, recurring.length]).toEqual([0, 1]);

    // O link do aviso leva ao molde em Recorrentes.
    await createRecurring(page, "receitas", "Nova receita", "Outro Futuro E2E", start);
    await page.getByTestId("recurring-created-notice").getByRole("link", { name: "Ver em Recorrentes" }).click();
    await expect(page).toHaveURL(/\/financeiro\/recorrentes/);
    await expect(page.getByText("Aluguel Futuro E2E")).toBeVisible();
  });

  test("Custos (a) início hoje: fica em Custos com a ocorrência e o selo", async ({ page }) => {
    test.setTimeout(90_000);
    const mail = email("rec-custos");
    await registerAndOnboard(page, mail);
    await createRecurring(page, "custos", "Novo custo", "Insumo Custos E2E", businessToday());
    await expect(page).toHaveURL(/\/financeiro\/custos/);
    const row = page.getByRole("row", { name: /Insumo Custos E2E/ });
    await expect(row.getByText("Recorrente", { exact: true })).toBeVisible();
    expect((await entriesOf(mail)).entries.map((e) => [e.type, e.source])).toEqual([["COST", "RECURRING"]]);
  });

  test("Despesas (a) início hoje, e (c) futuro com a mensagem de Despesa", async ({ page }) => {
    test.setTimeout(90_000);
    const mail = email("rec-despesas");
    await registerAndOnboard(page, mail);
    await createRecurring(page, "despesas", "Nova despesa", "Internet Despesas E2E", businessToday());
    await expect(page).toHaveURL(/\/financeiro\/despesas/);
    await expect(page.getByRole("row", { name: /Internet Despesas E2E/ }).getByText("Recorrente", { exact: true })).toBeVisible();

    const future = businessToday(10);
    await createRecurring(page, "despesas", "Nova despesa", "Seguro Despesas E2E", future);
    await expect(page.getByTestId("recurring-created-notice")).toContainText(`Despesa recorrente criada. A primeira entra em ${formatDateKey(future)}.`);
    expect((await entriesOf(mail)).entries.map((e) => [e.type, e.source])).toEqual([["EXPENSE", "RECURRING"]]);
  });
});
