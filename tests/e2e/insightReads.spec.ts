import { test, expect, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { gotoHydrated } from "./helpers/hydration";
import { fillMoney } from "./helpers/money";
import { businessToday } from "./helpers/businessDate";
import { assertTestDatabase, loadTestEnv } from "../testEnv";
import { addMonthsClamped, dateKeyToDbDate } from "../../src/lib/time/zoned";

// Insights: botão lido/não lido em cada card e contador de não lidos ao lado da lâmpada
// da barra lateral.
loadTestEnv();
assertTestDatabase();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const PASSWORD = "SenhaValida123";

async function registerAndOnboard(page: Page, email: string) {
  await gotoHydrated(page, "/register");
  await page.getByLabel("Nome").fill("Dono Insights E2E");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmar senha").fill(PASSWORD);
  await page.getByLabel(/Li e aceito/).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Loja", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Venda de produtos", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Nome da empresa").fill("Empresa Insights E2E");
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

// Receita e despesa crescem muito (mês anterior x este mês, dia 1) => insights de
// faturamento e de despesas; os demais são removidos para sobrar exatamente 2.
async function seedTwoInsights(page: Page, email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { business: true } });
  const business = user.business!;
  const [revenue, expense] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { type: "REVENUE", active: true, businessId: null }, orderBy: { name: "asc" } }),
    prisma.category.findFirstOrThrow({ where: { type: "EXPENSE", active: true, businessId: null }, orderBy: { name: "asc" } }),
  ]);
  const thisFirst = `${businessToday().slice(0, 7)}-01`;
  const prevFirst = addMonthsClamped(thisFirst, -1);
  const add = (type: "REVENUE" | "EXPENSE", categoryId: string, amount: string, day: string) =>
    prisma.financialEntry.create({ data: { businessId: business.id, userId: user.id, type, categoryId, description: `${type} ${day}`, amount, occurredOn: dateKeyToDbDate(day) } });
  await add("REVENUE", revenue.id, "1000", prevFirst);
  await add("REVENUE", revenue.id, "2000", thisFirst);
  await add("EXPENSE", expense.id, "200", prevFirst);
  await add("EXPENSE", expense.id, "900", thisFirst);

  await gotoHydrated(page, "/insights"); // gera o conjunto atual
  await expect(page.getByRole("heading", { name: "Faturamento em crescimento" })).toBeVisible();
  await prisma.insight.deleteMany({ where: { businessId: business.id, metric: { notIn: ["REVENUE_GROWTH", "EXPENSE_GROWTH"] } } });
  await page.reload(); // o contador (layout) lê o conjunto já gerado
  return business.id;
}

const badge = (page: Page) => page.locator('[data-testid="insights-unread-badge"]:visible');
const card = (page: Page, title: string) => page.locator("div.p-5").filter({ has: page.getByRole("heading", { name: title }) });
const readButton = (card: Locator) => card.getByRole("button", { name: /Marcar como (não )?lido/ });

test("Insights: lido/não lido por card, contador na lâmpada (sem recarregar), Atualizar mantém o estado, barra recolhida/expandida e teclado", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `insreads-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
  await registerAndOnboard(page, email);
  await seedTwoInsights(page, email);

  const revenue = card(page, "Faturamento em crescimento");
  const expenses = card(page, "Despesas em alta");

  // Com 2 insights não lidos: contador "2" ao lado do rótulo (barra expandida).
  await expect(page.locator("div.p-5")).toHaveCount(2);
  await expect(badge(page)).toHaveText("2");
  await expect(badge(page)).toHaveAttribute("aria-label", "2 insights não lidos");
  await expect(readButton(revenue)).toHaveAttribute("aria-pressed", "false");
  await expect(readButton(revenue)).toHaveAccessibleName("Marcar como lido");

  // Posição: o contador fica à direita do rótulo "Insights" (expandida).
  const label = page.locator("a.sidebar-nav-link .sidebar-label", { hasText: "Insights" });
  const labelBox = (await label.boundingBox())!;
  const badgeBox = (await badge(page).boundingBox())!;
  expect(badgeBox.x).toBeGreaterThan(labelBox.x + labelBox.width);

  // Marcar um => "1", sem recarregar a página inteira.
  await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 1));
  await readButton(revenue).click();
  await expect(badge(page)).toHaveText("1");
  await expect(readButton(revenue)).toHaveAttribute("aria-pressed", "true");
  await expect(readButton(revenue)).toHaveAccessibleName("Marcar como não lido");
  await expect(revenue.getByTestId("insight-body")).toHaveAttribute("data-read", "true");
  expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(1); // mesma página (sem reload)

  // Marcar o outro => o contador some.
  await readButton(expenses).click();
  await expect(badge(page)).toHaveCount(0);

  // Persistiu no banco: recarregar mantém os dois lidos.
  await page.reload();
  await expect(readButton(revenue)).toHaveAttribute("aria-pressed", "true");
  await expect(readButton(expenses)).toHaveAttribute("aria-pressed", "true");
  await expect(badge(page)).toHaveCount(0);

  // "Atualizar insights" com os mesmos dados: continuam lidos (a chave é estável).
  await page.getByRole("button", { name: "Atualizar insights" }).click();
  await expect(page.getByRole("button", { name: "Atualizar insights" })).toBeEnabled();
  await expect(readButton(card(page, "Faturamento em crescimento"))).toHaveAttribute("aria-pressed", "true");
  await expect(readButton(card(page, "Despesas em alta"))).toHaveAttribute("aria-pressed", "true");

  // Barra RECOLHIDA: desmarcar um => o contador aparece sobre o ícone da lâmpada.
  await page.getByRole("button", { name: "Recolher menu" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-sidebar-collapsed", "true");
  await readButton(card(page, "Despesas em alta")).click();
  await expect(readButton(card(page, "Despesas em alta"))).toHaveAttribute("aria-pressed", "false");
  const collapsedBadge = badge(page).first();
  await expect(collapsedBadge).toBeVisible();
  const linkBox = (await page.getByRole("link", { name: /Insights/ }).boundingBox())!;
  const collapsedBox = (await collapsedBadge.boundingBox())!;
  expect(collapsedBox.x).toBeGreaterThanOrEqual(linkBox.x);
  expect(collapsedBox.x + collapsedBox.width).toBeLessThanOrEqual(linkBox.x + linkBox.width + 4);
  expect(collapsedBox.y).toBeLessThan(linkBox.y + linkBox.height / 2); // sobre o ícone (parte de cima)
  await page.getByRole("button", { name: "Expandir menu" }).click();

  // Teclado: Tab até o botão do card e Enter / Espaço alternam.
  const target = readButton(card(page, "Faturamento em crescimento"));
  await page.locator("h1").click();
  for (let i = 0; i < 60 && !(await target.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(target).toBeFocused();
  await expect(target).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expect(target).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Space");
  await expect(target).toHaveAttribute("aria-pressed", "true");
});

test("Insights: marcar lido grava só na empresa do usuário da sessão", async ({ browser }) => {
  test.setTimeout(150_000);
  const emailA = `insreads-a-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerAndOnboard(page, emailA);
  const businessId = await seedTwoInsights(page, emailA);

  // O isolamento entre usuários/empresas é coberto na integração; aqui: o clique grava
  // exatamente uma linha, na empresa do usuário logado.
  await readButton(card(page, "Faturamento em crescimento")).click();
  await expect(badge(page)).toHaveText("1");
  expect(await prisma.insightRead.count({ where: { businessId } })).toBe(1);
  await context.close();
});
