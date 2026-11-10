import { test, expect, type Page } from "@playwright/test";
import { PrismaClient, Prisma, type BillStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { gotoHydrated } from "./helpers/hydration";
import { businessToday } from "./helpers/businessDate";
import { assertTestDatabase, loadTestEnv } from "../testEnv";
import { dateKeyToDbDate } from "../../src/lib/time/zoned";

// Vendas: filtro por situacao de PAGAMENTO (contagens acima da tabela, na URL) e
// card "A receber" com o total a receber e quanto esta atrasado.
loadTestEnv();
assertTestDatabase();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const { Decimal } = Prisma;

const PASSWORD = "SenhaValida123";

async function ok(response: { ok(): boolean; status(): number; text(): Promise<string>; json(): Promise<unknown> }, what: string) {
  expect(response.ok(), `${what}: ${response.status()} ${await response.text()}`).toBe(true);
}

async function setupBusiness(page: Page, label: string) {
  const request = page.context().request;
  const email = `vendas-pag-${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
  await ok(await request.post("/api/auth/register", { data: { name: "Dono Pagamento", email, password: PASSWORD, confirmPassword: PASSWORD } }), "register");
  const answers: [number, unknown][] = [
    [1, { businessType: "LOJA" }],
    [2, { revenueModel: ["venda_produtos"] }],
    [3, { name: "Empresa Pagamento E2E" }],
    [4, { yearsInBusiness: "DE_1_A_3_ANOS" }],
    [5, { employeeCount: 3 }],
    [6, { currency: "BRL", averageMonthlyRevenue: 10000 }],
  ];
  for (const [step, data] of answers) await ok(await request.post("/api/onboarding/answer", { data: { step, data } }), `answer ${step}`);
  await ok(await request.post("/api/onboarding/complete"), "complete");
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { business: true } });
  return { businessId: user.business!.id, userId: user.id };
}

type Seed = { businessId: string; userId: string; categoryId: string; seq: number };

async function seedSale(
  seed: Seed,
  name: string,
  bills: { amount: number; dueOffset: number; status: BillStatus }[],
  status: "CONFIRMED" | "COMPLETED" | "DRAFT" | "CANCELLED" = "CONFIRMED"
) {
  seed.seq += 1;
  const client = await prisma.client.create({ data: { businessId: seed.businessId, name } });
  const total = bills.reduce((sum, b) => sum + b.amount, 0) || 100;
  const sale = await prisma.sale.create({
    data: {
      businessId: seed.businessId, clientId: client.id, categoryId: seed.categoryId, userId: seed.userId, saleNumber: seed.seq,
      saleOn: dateKeyToDbDate(businessToday()), status, subtotal: new Decimal(total), total: new Decimal(total),
      clientRequestId: `vendas-pag-${seed.businessId}-${seed.seq}`,
      items: { create: [{ description: `Item ${name}`, quantity: new Decimal(1), unitPrice: new Decimal(total), lineTotal: new Decimal(total) }] },
    },
  });
  for (const [index, bill] of bills.entries()) {
    const dueOn = dateKeyToDbDate(businessToday(bill.dueOffset));
    await prisma.bill.create({
      data: {
        businessId: seed.businessId, categoryId: seed.categoryId, saleId: sale.id, description: `Venda #${seed.seq} (${index + 1})`,
        amount: new Decimal(bill.amount), dueOn, status: bill.status,
        ...(bill.status === "PAID" ? { paidOn: dueOn, paidAt: new Date() } : {}),
      },
    });
  }
}

// 2 pagas, 3 atrasadas (uma delas com 1 parcela paga + 1 vencida), 1 a vencer, 1 parcial (nada vencido), 1 cancelada e 1 rascunho (estas fora dos grupos).
//   A receber (card) = 100 + 150 + 60 (vencidas) + 400 + 80 (a vencer) = R$ 790,00; atrasado = R$ 310,00.
async function seedScenario(businessId: string, userId: string) {
  const category = await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } });
  const seed: Seed = { businessId, userId, categoryId: category.id, seq: 0 };
  await seedSale(seed, "Cli Paga 1", [{ amount: 300, dueOffset: 0, status: "PAID" }]);
  await seedSale(seed, "Cli Paga 2", [{ amount: 200, dueOffset: 0, status: "PAID" }]);
  await seedSale(seed, "Cli Atrasada 1", [{ amount: 100, dueOffset: -5, status: "PENDING" }]);
  await seedSale(seed, "Cli Atrasada 2", [{ amount: 150, dueOffset: -3, status: "PENDING" }]);
  await seedSale(seed, "Cli Aberta 1", [{ amount: 400, dueOffset: 10, status: "PENDING" }]);
  await seedSale(seed, "Cli Parcial 1", [{ amount: 100, dueOffset: 0, status: "PAID" }, { amount: 80, dueOffset: 20, status: "PENDING" }]);
  // O atraso tem prioridade sobre "parcialmente paga": 1 parcela paga + 1 vencida e ATRASADA.
  await seedSale(seed, "Cli Parcial Vencida", [{ amount: 120, dueOffset: 0, status: "PAID" }, { amount: 60, dueOffset: -4, status: "PENDING" }]);
  await seedSale(seed, "Cli Cancelada 1", [{ amount: 90, dueOffset: -2, status: "CANCELLED" }], "CANCELLED");
  await seedSale(seed, "Cli Rascunho 1", [], "DRAFT");
}

const rows = (page: Page) => page.locator("table tbody tr");

test.describe("Vendas - situação de pagamento", () => {
  test("filtro com contagens, na URL e mantido ao recarregar; card A receber", async ({ page }) => {
    test.setTimeout(120_000);
    const { businessId, userId } = await setupBusiness(page, "filtro");
    await seedScenario(businessId, userId);

    await gotoHydrated(page, "/vendas");
    const pill = (name: string) => page.getByRole("button", { name, exact: true });
    for (const label of ["Todas (9)", "Atrasadas (3)", "A vencer (1)", "Parcialmente pagas (1)", "Pagas (2)"]) {
      await expect(pill(label)).toBeVisible();
    }
    await expect(pill("Todas (9)")).toHaveAttribute("aria-pressed", "true");
    await expect(rows(page)).toHaveCount(9);

    // Card "A receber": o que falta receber e, a parte, o atrasado.
    const card = page.locator("div", { has: page.getByText("A receber", { exact: true }) }).filter({ hasText: "atrasado" }).last();
    await expect(card).toContainText("R$ 790,00");
    await expect(card).toContainText("R$ 310,00 atrasado");

    // Atrasadas: so as duas, URL atualizada.
    await pill("Atrasadas (3)").click();
    await expect(page).toHaveURL(/pagamento=atrasadas/);
    await expect(pill("Atrasadas (3)")).toHaveAttribute("aria-pressed", "true");
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByRole("row", { name: /Cli Atrasada 1/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /Cli Atrasada 2/ })).toBeVisible();
    // 1 paga + 1 vencida: Atrasada (e nao "Parcialmente paga").
    const paidAndOverdue = page.getByRole("row", { name: /Cli Parcial Vencida/ });
    await expect(paidAndOverdue).toBeVisible();
    await expect(paidAndOverdue.getByText("Atrasada", { exact: true })).toBeVisible();
    await expect(paidAndOverdue.getByText("Parcialmente paga", { exact: true })).toHaveCount(0);
    await expect(rows(page).filter({ hasText: "Atrasada" })).toHaveCount(3);
    // As contagens dos outros grupos continuam visiveis.
    await expect(pill("Pagas (2)")).toBeVisible();

    // Recarregar mantem o filtro.
    await page.reload();
    await expect(page).toHaveURL(/pagamento=atrasadas/);
    await expect(pill("Atrasadas (3)")).toHaveAttribute("aria-pressed", "true");
    await expect(rows(page)).toHaveCount(3);

    // Pagas: so as pagas.
    await pill("Pagas (2)").click();
    await expect(page).toHaveURL(/pagamento=pagas/);
    await expect(rows(page)).toHaveCount(2);
    await expect(page.getByRole("row", { name: /Cli Paga 1/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /Cli Paga 2/ })).toBeVisible();
    await expect(rows(page).filter({ hasText: "Atrasada" })).toHaveCount(0);

    // A vencer e Parcialmente pagas.
    await pill("A vencer (1)").click();
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByRole("row", { name: /Cli Aberta 1/ })).toBeVisible();
    await pill("Parcialmente pagas (1)").click();
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByRole("row", { name: /Cli Parcial 1/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /Cli Parcial Vencida/ })).toHaveCount(0); // essa e Atrasada

    // Voltar do navegador devolve o filtro anterior (esta na URL).
    await page.goBack();
    await expect(page).toHaveURL(/pagamento=a-vencer/);
    await expect(pill("A vencer (1)")).toHaveAttribute("aria-pressed", "true");

    // Todas volta a tudo (e tira o parametro da URL).
    await pill("Todas (9)").click();
    await expect(page).not.toHaveURL(/pagamento=/);
    await expect(rows(page)).toHaveCount(9);
  });

  test("combinado com os outros filtros: as contagens respeitam o Status da venda e cada grupo vazio tem sua mensagem", async ({ page }) => {
    test.setTimeout(90_000);
    const { businessId, userId } = await setupBusiness(page, "combo");
    await seedScenario(businessId, userId);

    // So as canceladas: nenhuma tem situacao de pagamento.
    await gotoHydrated(page, "/vendas?status=CANCELLED");
    await expect(page.getByRole("button", { name: "Todas (1)", exact: true })).toBeVisible();
    for (const label of ["Atrasadas (0)", "A vencer (0)", "Parcialmente pagas (0)", "Pagas (0)"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: "Atrasadas (0)", exact: true }).click();
    await expect(page).toHaveURL(/status=CANCELLED/); // os outros filtros ficam na URL
    await expect(page).toHaveURL(/pagamento=atrasadas/);
    await expect(page.getByText("Nenhuma venda atrasada no período.")).toBeVisible();

    await gotoHydrated(page, "/vendas?pagamento=pagas&status=CANCELLED");
    await expect(page.getByText("Nenhuma venda paga no período.")).toBeVisible();
    await gotoHydrated(page, "/vendas?pagamento=a-vencer&status=CANCELLED");
    await expect(page.getByText("Nenhuma venda a vencer no período.")).toBeVisible();
    await gotoHydrated(page, "/vendas?pagamento=parcialmente-pagas&status=CANCELLED");
    await expect(page.getByText("Nenhuma venda parcialmente paga no período.")).toBeVisible();

    // Pesquisar: a contagem acompanha.
    await gotoHydrated(page, "/vendas?q=Cli%20Atrasada");
    await expect(page.getByRole("button", { name: "Todas (2)", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Atrasadas (2)", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pagas (0)", exact: true })).toBeVisible();

    // O nome antigo do grupo ("em-aberto", hoje "A vencer") redireciona para o novo, mantendo os outros filtros.
    await gotoHydrated(page, "/vendas?pagamento=em-aberto&status=CONFIRMED");
    await expect(page).toHaveURL(/pagamento=a-vencer/);
    await expect(page).toHaveURL(/status=CONFIRMED/);
    await expect(page).not.toHaveURL(/em-aberto/);
    await expect(page.getByRole("button", { name: /^A vencer \(\d+\)$/ })).toHaveAttribute("aria-pressed", "true");

    // Valor invalido na URL e ignorado (equivale a Todas).
    await gotoHydrated(page, "/vendas?pagamento=qualquer");
    await expect(page.getByRole("button", { name: "Todas (9)", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(rows(page)).toHaveCount(9);
  });

  test("375px: filtros e cards se ajustam, sem rolagem lateral", async ({ page }) => {
    test.setTimeout(90_000);
    const { businessId, userId } = await setupBusiness(page, "estreito");
    await seedScenario(businessId, userId);
    await page.setViewportSize({ width: 375, height: 812 });

    await gotoHydrated(page, "/vendas");
    await expect(page.getByRole("button", { name: "Atrasadas (3)", exact: true })).toBeVisible();
    const card = page.locator("div", { has: page.getByText("A receber", { exact: true }) }).filter({ hasText: "atrasado" }).last();
    await expect(card).toContainText("R$ 790,00");
    const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);

    await page.getByRole("button", { name: "Atrasadas (3)", exact: true }).click();
    await expect(page).toHaveURL(/pagamento=atrasadas/);
    await expect(rows(page)).toHaveCount(3);
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});
