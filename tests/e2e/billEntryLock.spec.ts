import { test, expect, type Page } from "@playwright/test";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { gotoHydrated } from "./helpers/hydration";
import { fillMoney } from "./helpers/money";
import { businessToday } from "./helpers/businessDate";
import { assertTestDatabase, loadTestEnv } from "../testEnv";
import { dateKeyToDbDate } from "../../src/lib/time/zoned";

// Lancamento gerado pelo pagamento de uma conta (source BILL com conta): na lista
// de Receitas ele e somente leitura - "Ver conta" (ou "Ver venda") no lugar de
// Editar/Excluir; o link leva a tela onde o "Reverter" existe. O manual
// continua com Editar/Excluir.
loadTestEnv();
assertTestDatabase();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const { Decimal } = Prisma;
const PASSWORD = "SenhaValida123";

async function register(page: Page, name: string, email: string) {
  await gotoHydrated(page, "/register");
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmar senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
}

async function completeOnboarding(page: Page, name: string) {
  await page.getByRole("button", { name: "Loja", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Venda de produtos", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Nome da empresa").fill(name);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "1 a 3 anos", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Número de pessoas").fill("5");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /BRL/ }).click();
  await fillMoney(page.getByLabel("Valor médio mensal"), "10000");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Tudo pronto!" })).toBeVisible();
  await page.getByRole("button", { name: "Ir para o dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("Receitas: lançamento de pagamento de conta é somente leitura (Ver conta / Ver venda); o manual segue editável", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `billlock-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
  await register(page, "Dono Lock E2E", email);
  await completeOnboarding(page, "Empresa Lock E2E");

  const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { business: true } });
  const business = user.business!;
  const today = businessToday();
  const day = dateKeyToDbDate(today);
  const revenue = await prisma.category.findFirstOrThrow({ where: { type: "REVENUE", active: true, businessId: null }, orderBy: { name: "asc" } });

  // 1) Conta a receber avulsa, recebida (Bill PAID + lancamento BILL vinculado).
  const bill = await prisma.bill.create({
    data: { businessId: business.id, categoryId: revenue.id, description: "Mensalidade Lock E2E", amount: new Decimal("200.00"), dueOn: day, status: "PAID", paidOn: day, paidAt: new Date() },
  });
  await prisma.financialEntry.create({
    data: { businessId: business.id, userId: user.id, type: "REVENUE", categoryId: revenue.id, amount: new Decimal("200.00"), description: "Mensalidade Lock E2E", occurredOn: day, source: "BILL", billId: bill.id },
  });

  // 2) Parcela de venda recebida (lancamento BILL vinculado a uma conta de venda).
  const client = await prisma.client.create({ data: { businessId: business.id, name: "Cliente Lock E2E" } });
  const sale = await prisma.sale.create({
    data: { businessId: business.id, clientId: client.id, categoryId: revenue.id, userId: user.id, saleNumber: 1, saleOn: day, status: "CONFIRMED", subtotal: new Decimal("90.00"), total: new Decimal("90.00"), clientRequestId: `lock-${Date.now()}` },
  });
  const saleBill = await prisma.bill.create({
    data: { businessId: business.id, categoryId: revenue.id, saleId: sale.id, description: "Venda #1 Lock E2E", amount: new Decimal("90.00"), dueOn: day, status: "PAID", paidOn: day, paidAt: new Date() },
  });
  await prisma.financialEntry.create({
    data: { businessId: business.id, userId: user.id, type: "REVENUE", categoryId: revenue.id, amount: new Decimal("90.00"), description: "Venda #1 Lock E2E", occurredOn: day, source: "BILL", billId: saleBill.id },
  });

  // 3) Lancamento manual.
  await prisma.financialEntry.create({
    data: { businessId: business.id, userId: user.id, type: "REVENUE", categoryId: revenue.id, amount: new Decimal("30.00"), description: "Manual Lock E2E", occurredOn: day, source: "MANUAL" },
  });

  await gotoHydrated(page, "/financeiro/receitas");

  const billRow = page.getByRole("row", { name: /Mensalidade Lock E2E/ });
  await expect(billRow.getByRole("link", { name: "Ver conta" })).toBeVisible();
  await expect(billRow.getByRole("button", { name: "Editar" })).toHaveCount(0);
  await expect(billRow.getByRole("button", { name: "Excluir" })).toHaveCount(0);

  const saleRow = page.getByRole("row", { name: /Venda #1 Lock E2E/ });
  await expect(saleRow.getByRole("link", { name: "Ver venda" })).toHaveAttribute("href", `/vendas/${sale.id}`);
  await expect(saleRow.getByRole("button", { name: "Editar" })).toHaveCount(0);
  await expect(saleRow.getByRole("button", { name: "Excluir" })).toHaveCount(0);

  const manualRow = page.getByRole("row", { name: /Manual Lock E2E/ });
  await expect(manualRow.getByRole("button", { name: "Editar" })).toBeVisible();
  await expect(manualRow.getByRole("button", { name: "Excluir" })).toBeVisible();
  await expect(manualRow.getByRole("link", { name: /Ver (conta|venda)/ })).toHaveCount(0);

  // "Ver conta" leva a Contas a receber, onde a conta paga tem "Reverter".
  await billRow.getByRole("link", { name: "Ver conta" }).click();
  await expect(page).toHaveURL(/\/financeiro\/receber\?status=PAID&q=Mensalidade/);
  const receivable = page.getByRole("row", { name: /Mensalidade Lock E2E/ });
  await expect(receivable).toBeVisible();
  await expect(receivable.getByRole("button", { name: "Reverter" })).toBeVisible();

  // "Ver venda" leva a venda.
  await gotoHydrated(page, "/financeiro/receitas");
  await page.getByRole("row", { name: /Venda #1 Lock E2E/ }).getByRole("link", { name: "Ver venda" }).click();
  await expect(page).toHaveURL(new RegExp(`/vendas/${sale.id}`));
});
