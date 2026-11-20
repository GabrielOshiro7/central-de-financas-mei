import { test, expect } from "@playwright/test";
import { gotoHydrated } from "./helpers/hydration";
import { createOnboardedUser, newTestPrisma } from "./helpers/session";
import { businessToday } from "./helpers/businessDate";
import { assertTestDatabase, loadTestEnv } from "../testEnv";
import { dateKeyToDbDate } from "@/lib/time/zoned";

// Remocao do tipo "Custo": a aba nao existe mais (URL antiga redireciona), o Dashboard nao mostra Custos
// nem Margem bruta (nem seus derivados), e o formulario so oferece Receita/Despesa.
loadTestEnv();
assertTestDatabase();
const prisma = newTestPrisma();

let user: Awaited<ReturnType<typeof createOnboardedUser>>;

test.beforeAll(async () => {
  user = await createOnboardedUser(prisma, "sem-custo");
  const business = await prisma.business.findUniqueOrThrow({ where: { userId: user.userId } });
  const [revenue, expense] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE", name: "Venda de produtos" } }),
    prisma.category.findFirstOrThrow({ where: { businessId: null, type: "EXPENSE", name: "Mercadoria" } }), // era categoria de custo
  ]);
  const occurredOn = dateKeyToDbDate(businessToday());
  await prisma.financialEntry.createMany({
    data: [
      { businessId: business.id, userId: user.userId, type: "REVENUE", categoryId: revenue.id, description: "Venda E2E sem custo", amount: "1000", occurredOn },
      { businessId: business.id, userId: user.userId, type: "EXPENSE", categoryId: expense.id, description: "Mercadoria E2E sem custo", amount: "400", occurredOn },
    ],
  });
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: user.userId } });
  await prisma.$disconnect();
});

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "cookie-notice", value: "1", url: baseURL! }]);
  await user.signIn(context, baseURL!);
});

test.describe("tipo Custo removido", () => {
  test("/financeiro/custos redireciona para /financeiro/despesas (temporário, 307)", async ({ page, request, baseURL }) => {
    const raw = await request.get(`${baseURL}/financeiro/custos`, { maxRedirects: 0, headers: { cookie: user.cookieHeader } });
    expect(raw.status()).toBe(307);
    expect(new URL(raw.headers()["location"], baseURL).pathname).toBe("/financeiro/despesas");

    await page.goto("/financeiro/custos");
    await expect(page).toHaveURL(/\/financeiro\/despesas$/);
    await expect(page.getByRole("heading", { level: 1, name: "Despesas" })).toBeVisible();
  });

  test("a barra do Financeiro não tem a aba Custos e a despesa que era custo aparece em Despesas", async ({ page }) => {
    await gotoHydrated(page, "/financeiro/despesas");
    const nav = page.getByRole("navigation", { name: "Seções do Financeiro" });
    await expect(nav.getByRole("link", { name: "Despesas" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Custos" })).toHaveCount(0);
    await expect(page.getByRole("row", { name: /Mercadoria E2E sem custo/ })).toBeVisible();
  });

  test("Dashboard: sem Custos, Margem bruta, Participação dos custos, Ponto de equilíbrio nem Distribuição de custos", async ({ page }) => {
    await gotoHydrated(page, "/dashboard");
    await expect(page.getByRole("heading", { name: "Distribuição de despesas" })).toBeVisible();

    // Sem os cartões/indicadores de custo (texto exato: "Despesas" etc. continuam).
    for (const text of ["Custos", "Margem bruta", "Participação dos custos", "Ponto de equilíbrio", "Distribuição de custos"]) {
      await expect(page.getByText(text, { exact: true }), text).toHaveCount(0);
    }
    // Nenhum texto de custo em nenhum lugar do painel (exceto o apelido "Centro de custo", que nao esta no Dashboard).
    await expect(page.locator("main")).not.toContainText(/\bcustos?\b/i);

    // Os cartões que ficam: Faturamento, Despesas, Lucro e Margem líquida (valores: 1000, 400, 600, 60%).
    const cards = page.locator("main .grid").first().locator("> *");
    await expect(cards).toHaveCount(4);
    for (const label of ["Faturamento", "Despesas", "Lucro", "Margem líquida"]) {
      await expect(page.locator("main .grid").first().getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.locator("main .grid").first()).toContainText("60");
  });

  test("Dashboard: os 4 cartões ocupam linhas inteiras, sem buracos (desktop, tablet e celular)", async ({ page }) => {
    const boxes = async () => {
      const cards = page.locator("main .grid").first().locator("> *");
      const n = await cards.count();
      const out = [];
      for (let i = 0; i < n; i++) out.push((await cards.nth(i).boundingBox())!);
      return out;
    };

    // Desktop (>= 1024): 4 na mesma linha.
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoHydrated(page, "/dashboard");
    let b = await boxes();
    expect(b).toHaveLength(4);
    expect(new Set(b.map((x) => Math.round(x.y))).size).toBe(1);

    // Tablet (480–1023): 2 x 2.
    await page.setViewportSize({ width: 768, height: 900 });
    b = await boxes();
    expect(Math.round(b[0].y)).toBe(Math.round(b[1].y));
    expect(Math.round(b[2].y)).toBe(Math.round(b[3].y));
    expect(b[2].y).toBeGreaterThan(b[0].y);
    expect(Math.round(b[0].width)).toBe(Math.round(b[2].width)); // sem cartão sozinho numa linha (buraco)

    // Celular (390): uma coluna, sem rolagem horizontal.
    await page.setViewportSize({ width: 390, height: 800 });
    b = await boxes();
    expect(new Set(b.map((x) => Math.round(x.x))).size).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("o formulário de lançamento recorrente só oferece Receita e Despesa", async ({ page }) => {
    await gotoHydrated(page, "/financeiro/recorrentes");
    await page.getByRole("button", { name: "Novo lançamento recorrente", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Receita", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Despesa", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^Custo/ })).toHaveCount(0);

    // Categorias oferecidas ao escolher Despesa: as antigas categorias de custo agora são despesa.
    await dialog.getByRole("button", { name: "Despesa", exact: true }).click();
    await expect(dialog.getByRole("combobox", { name: /categoria/i }).or(dialog.getByLabel("Categoria"))).toContainText("Mercadoria");
  });
});
