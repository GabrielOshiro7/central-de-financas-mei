import { test, expect, type Page } from "@playwright/test";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { gotoHydrated } from "./helpers/hydration";
import { fillMoney } from "./helpers/money";
import { businessToday } from "./helpers/businessDate";
import { assertTestDatabase, loadTestEnv } from "../testEnv";
import { dateKeyToDbDate } from "../../src/lib/time/zoned";

// Dinheiro exibido em pt-BR (ponto de milhar, virgula decimal, simbolo simples)
// por formatMoney, no servidor e no navegador (sem erro de hidratacao). O
// espaco entre simbolo e numero e o U+00A0 no DOM; o Playwright o normaliza nos
// matchers de texto.
loadTestEnv();
assertTestDatabase();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const { Decimal } = Prisma;

const PASSWORD = "SenhaValida123";

async function setupJpyBusiness(page: Page) {
  const email = `money-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
  await gotoHydrated(page, "/register");
  await page.getByLabel("Nome").fill("Dono Dinheiro E2E");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmar senha").fill(PASSWORD);
  await page.getByLabel(/Li e aceito/).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Loja", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Venda de produtos", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Nome da empresa").fill("Empresa Iene E2E");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "1 a 3 anos", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Número de pessoas").fill("2");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /JPY/ }).click();
  await fillMoney(page.getByLabel("Valor médio mensal"), "500000", { currency: "JPY" });
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Ir para o dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { business: true } });
  return { businessId: user.business!.id, userId: user.id };
}

test("dinheiro em pt-BR: Total do agendamento, Receitas e Dashboard (iene, com negativo), sem erro de hidratação", async ({ page }) => {
  test.setTimeout(120_000);
  const problems: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(msg.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  const { businessId, userId } = await setupJpyBusiness(page);
  expect((await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).currency).toBe("JPY");

  const [revenueCategory, expenseCategory] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE", name: "Venda de serviços" } }),
    prisma.category.findFirstOrThrow({ where: { businessId: null, type: "EXPENSE" } }),
  ]);
  const client = await prisma.client.create({ data: { businessId, name: "Cliente Iene E2E" } });
  await prisma.product.create({ data: { businessId, name: "Corte Iene E2E", type: "SERVICO", defaultPrice: new Decimal(12000) } });
  const today = dateKeyToDbDate(businessToday());
  // Receita 110000 e despesa 180585: o lucro do mes e -70585.
  await prisma.financialEntry.create({
    data: { businessId, userId, type: "REVENUE", categoryId: revenueCategory.id, amount: new Decimal(110000), description: "Receita Iene E2E", occurredOn: today },
  });
  await prisma.financialEntry.create({
    data: { businessId, userId, type: "EXPENSE", categoryId: expenseCategory.id, amount: new Decimal(180585), description: "Despesa Iene E2E", occurredOn: today },
  });

  // Novo agendamento: servico de ¥12.000 -> Total "¥ 12.000" (e 2 unidades -> "¥ 24.000").
  await gotoHydrated(page, `/agenda/novo?clientId=${client.id}`);
  await page.getByLabel("Adicionar serviço").selectOption({ label: "Corte Iene E2E" });
  const total = page.getByTestId("day-appointment-total");
  await expect(total).toHaveText("¥ 12.000");
  await page.getByLabel("Quantidade").first().fill("2");
  await expect(total).toHaveText("¥ 24.000");
  await page.getByLabel("Quantidade").first().fill("1");
  await expect(total).toHaveText("¥ 12.000");
  await page.getByRole("button", { name: "Agendar" }).click();
  await expect(page).toHaveURL(/view=day/);
  await expect(page.getByText("Total do dia: 1 atendimento · ¥ 12.000")).toBeVisible();

  // Receitas: valor com ponto de milhar.
  await gotoHydrated(page, "/financeiro/receitas");
  const revenueRow = page.getByRole("row", { name: /Receita Iene E2E/ });
  await expect(revenueRow.getByText("¥ 110.000")).toBeVisible();

  // Dashboard: faturamento e lucro NEGATIVO no formato pt-BR.
  await gotoHydrated(page, "/dashboard");
  await expect(page.getByText("¥ 110.000").first()).toBeVisible();
  await expect(page.getByText("-¥ 70.585").first()).toBeVisible();
  await expect(page.getByText("¥110,000")).toHaveCount(0); // formato antigo (en-US) nao aparece mais

  // Texto bruto: o espaco entre simbolo e numero e o U+00A0 (sem quebra de linha).
  const raw = await page.getByText("¥ 110.000").first().textContent();
  expect(raw).toContain("¥ 110.000");

  expect(problems.filter((text) => /hydrat/i.test(text)), `Erros de hidratação: ${problems.join(" | ")}`).toEqual([]);
  expect(problems, `Erros de console/página: ${problems.join(" | ")}`).toEqual([]);
});

test.afterAll(async () => {
  await prisma.$disconnect();
});
