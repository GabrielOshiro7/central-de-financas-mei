import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { gotoHydrated } from "./helpers/hydration";

const PASSWORD = "SenhaValida123";

// Cria a sessao via API (o cadastro pela UI nao e necessario pra testar a
// Sidebar, e mantem o teste independente da tela de registro).
async function loginOnboardedUser(context: BrowserContext, label: string) {
  const email = `sidebar-${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
  const reg = await context.request.post("/api/auth/register", {
    data: { name: "Sidebar E2E", email, password: PASSWORD, confirmPassword: PASSWORD },
  });
  expect(reg.status()).toBe(201);

  const answers: [number, unknown][] = [
    [1, { businessType: "LOJA" }],
    [2, { revenueModel: ["venda_produtos"] }],
    [3, { name: "Empresa Sidebar E2E" }],
    [4, { yearsInBusiness: "DE_1_A_3_ANOS" }],
    [5, { employeeCount: 5 }],
    [6, { currency: "BRL", averageMonthlyRevenue: 10000 }],
  ];
  for (const [step, data] of answers) {
    const r = await context.request.post("/api/onboarding/answer", { data: { step, data } });
    expect(r.ok()).toBe(true);
  }
  const done = await context.request.post("/api/onboarding/complete");
  expect(done.ok()).toBe(true);
}

// Espera a hidratacao antes de clicar: um clique antes do React ligar o
// handler nao recolhe a sidebar e o teste passaria a ver o estado errado.
async function openCollapsedSidebar(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoHydrated(page, "/dashboard");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Recolher menu" }).click();
  await expect(page.getByRole("button", { name: "Expandir menu" })).toBeVisible();
}

function navItem(page: Page, label: string) {
  return page.locator("li.sidebar-item", { hasText: label });
}

function tooltipShown(page: Page, label: string) {
  return navItem(page, label)
    .locator(".sidebar-tooltip")
    .evaluate((el) => getComputedStyle(el).display !== "none");
}

test.describe("sidebar - tooltip dos itens recolhidos", () => {
  test.setTimeout(60_000);

  test("hover mostra, sair do hover esconde, e clicar (navegar) nao deixa o tooltip preso", async ({ page, context }) => {
    await loginOnboardedUser(context, "hover");
    await openCollapsedSidebar(page);

    // Hover mostra o tooltip do item.
    await navItem(page, "Financeiro").hover();
    expect(await tooltipShown(page, "Financeiro")).toBe(true);

    // Tirar o mouse sem clicar esconde.
    await page.mouse.move(700, 400);
    expect(await tooltipShown(page, "Financeiro")).toBe(false);

    // Clicar num item diferente (navega) e tirar o mouse nao deixa preso.
    await navItem(page, "Clientes").locator("a").click();
    await page.waitForURL(/\/clientes/);
    await page.mouse.move(700, 400);
    expect(await tooltipShown(page, "Clientes")).toBe(false);

    // Clicar no item da pagina atual e tirar o mouse - mesmo resultado.
    await navItem(page, "Clientes").locator("a").click();
    await page.mouse.move(700, 400);
    expect(await tooltipShown(page, "Clientes")).toBe(false);
  });

  test("teclado continua mostrando o tooltip no foco", async ({ page, context }) => {
    await loginOnboardedUser(context, "keyboard");
    await openCollapsedSidebar(page);

    await navItem(page, "Vendas").locator("a").focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    expect(await tooltipShown(page, "Vendas")).toBe(true);
  });

  test("expandida, o tooltip nunca aparece", async ({ page, context }) => {
    await loginOnboardedUser(context, "expanded");
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoHydrated(page, "/dashboard");
    await navItem(page, "Financeiro").hover();
    expect(await tooltipShown(page, "Financeiro")).toBe(false);
  });
});
