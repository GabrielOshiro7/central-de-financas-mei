import { test, expect, type Page } from "@playwright/test";
import { gotoHydrated } from "./helpers/hydration";
import { fillMoney } from "./helpers/money";
import { businessToday } from "./helpers/businessDate";
import { addDays, addMonthsClamped, formatDateKey } from "../../src/lib/time/zoned";

// Visao Geral: 6 opcoes de periodo, sem "Comparar com"; a comparacao e sempre com
// o periodo anterior equivalente e o intervalo aparece no cabecalho.
const PASSWORD = "SenhaValida123";

async function registerAndOnboard(page: Page) {
  const email = `dashfilters-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
  await gotoHydrated(page, "/register");
  await page.getByLabel("Nome").fill("Dono Filtros Dashboard");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmar senha").fill(PASSWORD);
  await page.getByLabel(/Li e aceito/).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Loja", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Venda de produtos", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Nome da empresa").fill("Empresa Filtros Dashboard");
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

const comparisonText = (from: string, to: string) => `Comparado com ${formatDateKey(from)} — ${formatDateKey(to)}`;

test.describe("Visão Geral - filtros", () => {
  test("o seletor tem exatamente as 6 opções, 'Comparar com' não existe, e 'Comparado com …' muda com o período", async ({ page }) => {
    test.setTimeout(90_000);
    await registerAndOnboard(page);
    await gotoHydrated(page, "/dashboard");

    const options = page.locator("#dashboard-period option");
    await expect(options).toHaveText(["Este mês", "Mês passado", "Últimos 3 meses", "Este ano", "Ano passado", "Personalizado"]);
    await expect(page.getByLabel("Comparar com")).toHaveCount(0);
    await expect(page.locator("#dashboard-comparison")).toHaveCount(0);

    const today = businessToday();
    const thisFirst = `${today.slice(0, 7)}-01`;
    const comparison = page.getByTestId("dashboard-comparison-range");

    // Cabeçalho: Este mês vai do 1º dia até HOJE (e não até o fim do mês).
    await expect(page.getByText(`Este mês (${formatDateKey(thisFirst)} — ${formatDateKey(today)})`)).toBeVisible();

    // Este mês: o mês anterior do dia 1 até o mesmo dia de hoje (clampado ao último dia dele).
    await expect(comparison).toHaveText(comparisonText(addMonthsClamped(thisFirst, -1), addMonthsClamped(today, -1)));

    // Mês passado: o mês anterior a ele, completo.
    await page.locator("#dashboard-period").selectOption("LAST_MONTH");
    await expect(page).toHaveURL(/period=LAST_MONTH/);
    await expect(comparison).toHaveText(comparisonText(addMonthsClamped(thisFirst, -2), addDays(addMonthsClamped(thisFirst, -1), -1)));

    // Últimos 3 meses (o atual e os 2 anteriores): os 3 meses anteriores, completos.
    await page.locator("#dashboard-period").selectOption("LAST_3_MONTHS");
    await expect(comparison).toHaveText(comparisonText(addMonthsClamped(thisFirst, -5), addDays(addMonthsClamped(thisFirst, -2), -1)));

    // Este ano: 1/jan do ano anterior até o mesmo dia do ano anterior.
    await page.locator("#dashboard-period").selectOption("THIS_YEAR");
    const lastYear = Number(today.slice(0, 4)) - 1;
    await expect(page.getByText(`Este ano (${formatDateKey(`${lastYear + 1}-01-01`)} — ${formatDateKey(today)})`)).toBeVisible();
    await expect(comparison).toHaveText(comparisonText(`${lastYear}-01-01`, addMonthsClamped(today, -12)));

    // Ano passado: o ano anterior a ele, completo.
    await page.locator("#dashboard-period").selectOption("LAST_YEAR");
    await expect(comparison).toHaveText(comparisonText(`${lastYear - 1}-01-01`, `${lastYear - 1}-12-31`));

    // Personalizado: o intervalo de mesma quantidade de dias imediatamente anterior.
    await page.locator("#dashboard-period").selectOption("CUSTOM");
    await page.locator("#dashboard-start").fill("2026-03-01");
    await page.locator("#dashboard-end").fill("2026-03-10");
    await expect(comparison).toHaveText(comparisonText("2026-02-19", "2026-02-28"));
  });

  test("URLs antigas: período que não existe mais abre em 'Este mês' e ?comparison= é removido, sem erro", async ({ page }) => {
    test.setTimeout(90_000);
    await registerAndOnboard(page);

    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await gotoHydrated(page, "/dashboard?period=LAST_7_DAYS&comparison=NONE");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Visão Geral" })).toBeVisible();
    await expect(page.locator("#dashboard-period")).toHaveValue("THIS_MONTH");

    for (const old of ["TODAY", "LAST_30_DAYS", "LAST_90_DAYS", "LAST_6_MONTHS"]) {
      await gotoHydrated(page, `/dashboard?period=${old}`);
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.locator("#dashboard-period")).toHaveValue("THIS_MONTH");
    }

    // Período válido é mantido; só o comparison sai da URL.
    await gotoHydrated(page, "/dashboard?period=LAST_MONTH&comparison=SAME_PERIOD_LAST_YEAR");
    await expect(page).toHaveURL(/\/dashboard\?period=LAST_MONTH$/);
    await expect(page.locator("#dashboard-period")).toHaveValue("LAST_MONTH");
    expect(errors).toEqual([]);
  });
});
