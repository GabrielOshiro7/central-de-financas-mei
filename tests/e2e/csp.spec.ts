import { test, expect, type Page } from "@playwright/test";
import { gotoHydrated } from "./helpers/hydration";
import { createOnboardedUser, newTestPrisma } from "./helpers/session";
import { assertTestDatabase, loadTestEnv } from "../testEnv";

// A CSP esta em MODO DE OBSERVACAO: o navegador so registra violacoes (no console e no evento
// `securitypolicyviolation`), nada e bloqueado. Este teste carrega as telas principais e
// exige ZERO violacoes - qualquer uma que apareca e listada na falha.
loadTestEnv();
assertTestDatabase();
const prisma = newTestPrisma();
const createdUserIds: string[] = [];

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

type Violation = { source: string; detail: string };

// Coleta por dois caminhos: o evento DOM (inclui as de Report-Only) e as mensagens do console.
async function watchViolations(page: Page): Promise<() => Promise<Violation[]>> {
  const fromConsole: Violation[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (/content security policy|content-security-policy/i.test(text)) fromConsole.push({ source: "console", detail: text.slice(0, 400) });
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] };
    w.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      w.__cspViolations.push(`${e.disposition} ${e.violatedDirective} blocked=${e.blockedURI} source=${e.sourceFile}:${e.lineNumber} sample=${e.sample}`);
    });
  });
  return async () => {
    const fromEvents = await page
      .evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [])
      .catch(() => [] as string[]);
    return [...fromConsole, ...fromEvents.map((detail) => ({ source: "evento", detail }))];
  };
}

const PUBLIC_PAGES = ["/", "/login", "/register", "/forgot-password", "/privacidade", "/termos", "/cookies", "/tokushoho"];
const APP_PAGES = ["/dashboard", "/financeiro/receitas", "/financeiro/despesas", "/financeiro/pagar", "/financeiro/recorrentes", "/agenda", "/agenda/novo", "/vendas", "/vendas/nova", "/clientes", "/caixa", "/insights", "/configuracoes"];

test.describe("CSP em observação: nenhuma violação nas telas principais", () => {
  test("controle: o coletor enxerga uma violação provocada (o 'zero' dos outros testes não é cegueira)", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const collect = await watchViolations(page);
    await gotoHydrated(page, "/login");
    expect(await collect()).toEqual([]);
    // Imagem de origem externa (host .invalid: nunca resolve, nada sai da maquina) viola img-src.
    await page.evaluate(() => {
      const img = new Image();
      img.src = "https://csp-controle.invalid/x.png";
      document.body.appendChild(img);
    });
    await expect.poll(async () => (await collect()).length).toBeGreaterThan(0);
    const found = await collect();
    expect(found.map((v) => v.detail).join("\n")).toMatch(/img-src/);
    expect(found.map((v) => v.detail).join("\n")).toMatch(/report/i); // disposition "report": so observacao, nada bloqueado
    await context.close();
  });

  test("telas públicas (landing, login, cadastro, recuperação e páginas legais)", async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext(); // visitante novo: o aviso de cookies tambem aparece
    const page = await context.newPage();
    const collect = await watchViolations(page);
    for (const path of PUBLIC_PAGES) {
      await gotoHydrated(page, path);
      await expect(page.locator("body")).toBeVisible();
      expect(await collect(), `violacoes de CSP em ${path}`).toEqual([]);
    }
    await context.close();
  });

  test("telas do app logado (dashboard, financeiro, agenda, vendas, clientes, caixa, insights, configurações)", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const user = await createOnboardedUser(prisma, "csp");
    createdUserIds.push(user.userId);
    const context = await browser.newContext();
    await user.signIn(context, baseURL!);
    const page = await context.newPage();
    const collect = await watchViolations(page);
    for (const path of APP_PAGES) {
      await gotoHydrated(page, path);
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, "\\/")}$`));
      expect(await collect(), `violacoes de CSP em ${path}`).toEqual([]);
    }
    await context.close();
  });

  test("navegação dentro do app (links da barra lateral carregam chunks sob 'strict-dynamic') e o modal de criação", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const user = await createOnboardedUser(prisma, "csp-nav");
    createdUserIds.push(user.userId);
    const context = await browser.newContext();
    await user.signIn(context, baseURL!);
    const page = await context.newPage();
    const collect = await watchViolations(page);
    await gotoHydrated(page, "/dashboard");
    for (const [name, url] of [["Agenda", /\/agenda$/], ["Vendas", /\/vendas$/], ["Clientes", /\/clientes$/], ["Insights", /\/insights$/], ["Dashboard", /\/dashboard$/]] as const) {
      await page.getByRole("link", { name, exact: false }).first().click();
      await expect(page).toHaveURL(url);
      await expect(page.locator("main")).toBeVisible();
    }
    expect(await collect(), "violacoes de CSP durante a navegacao").toEqual([]);
    await context.close();
  });
});
