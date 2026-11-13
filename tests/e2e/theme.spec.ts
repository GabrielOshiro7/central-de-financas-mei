import { test, expect, type Browser, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { gotoHydrated } from "./helpers/hydration";
import { fillMoney } from "./helpers/money";
import { assertTestDatabase, loadTestEnv } from "../testEnv";

// Tema: padrão CLARO (o app não segue prefers-color-scheme), escolha salva em cookie
// (o servidor já renderiza a <html> no tema certo - sem piscar) e, para o usuário
// logado, no banco (vale em outro navegador). Migração do localStorage legado.
loadTestEnv();
assertTestDatabase();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const PASSWORD = "SenhaValida123";

const email = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
const htmlTheme = (page: Page) => page.locator("html").getAttribute("data-theme");
const themeInDb = async (mail: string) => (await prisma.user.findUniqueOrThrow({ where: { email: mail }, select: { themePreference: true } })).themePreference;

async function registerAndOnboard(page: Page, mail: string) {
  await gotoHydrated(page, "/register");
  await page.getByLabel("Nome").fill("Dono Tema E2E");
  await page.getByLabel("E-mail").fill(mail);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmar senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Loja", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Venda de produtos", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Nome da empresa").fill("Empresa Tema E2E");
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

async function loginInFreshContext(browser: Browser, mail: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await gotoHydrated(page, "/login");
  await page.getByLabel("E-mail").fill(mail);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return { context, page };
}

// O HTML que o SERVIDOR devolve (antes de qualquer script rodar).
async function serverHtml(page: Page, path: string) {
  return (await page.request.get(path)).text();
}
const serverTheme = async (page: Page, path: string) => /<html[^>]*\sdata-theme="(light|dark)"/.exec(await serverHtml(page, path))?.[1];

test.describe("tema", () => {
  test("visitante: landing e login abrem em CLARO mesmo com o navegador pedindo prefers-color-scheme: dark", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();
    for (const path of ["/", "/login", "/register", "/forgot-password"]) {
      await gotoHydrated(page, path);
      expect(await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)).toBe(true); // o navegador pede escuro...
      expect(await htmlTheme(page)).toBe("light"); // ...e o app continua claro
      expect(await serverTheme(page, path)).toBe("light");
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(243, 238, 227)"); // #F3EEE3
    }
    await context.close();
  });

  test("visitante troca o tema na landing: só cookie (sem banco); recarregar mantém", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await gotoHydrated(page, "/");
    await page.getByRole("button", { name: "Ativar tema escuro" }).click();
    await expect.poll(() => htmlTheme(page)).toBe("dark");
    expect((await context.cookies()).find((c) => c.name === "theme")?.value).toBe("dark");
    expect(requests.filter((url) => url.includes("/api/account/theme"))).toEqual([]); // visitante não chama a rota
    await page.reload();
    expect(await htmlTheme(page)).toBe("dark");
    expect(await serverTheme(page, "/login")).toBe("dark"); // o servidor já devolve escuro
    await context.close();
  });

  test("usuário novo entra em claro; escuro persiste ao recarregar (já no HTML do servidor), no banco e em outro navegador; volta ao claro e persiste", async ({ browser }) => {
    test.setTimeout(150_000);
    const mail = email("tema");
    const errors: string[] = [];
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await registerAndOnboard(page, mail);
    expect(await htmlTheme(page)).toBe("light"); // sem escolha salva: claro (mesmo com o SO em escuro)
    expect(await themeInDb(mail)).toBeNull();
    expect(await serverTheme(page, "/dashboard")).toBe("light");

    // Trocar para escuro: cookie na hora e banco logo depois.
    await page.getByRole("button", { name: "Ativar tema escuro" }).click();
    await expect.poll(() => htmlTheme(page)).toBe("dark");
    await expect.poll(() => themeInDb(mail)).toBe("DARK");

    // Recarregar: o HTML que o servidor devolve já traz o tema escuro (sem script que troque depois).
    expect(await serverTheme(page, "/dashboard")).toBe("dark");
    await page.reload();
    expect(await htmlTheme(page)).toBe("dark");
    await expect(page.getByRole("button", { name: "Ativar tema claro" })).toBeVisible(); // ícone/rótulo certos já no primeiro render

    // Logout e login num NOVO contexto de navegador (sem cookie): o escuro vem do banco.
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login/);
    const other = await loginInFreshContext(browser, mail);
    expect(await htmlTheme(other.page)).toBe("dark");
    expect(await serverTheme(other.page, "/dashboard")).toBe("dark");

    // Volta ao claro no outro navegador: persiste (banco + cookie).
    await other.page.getByRole("button", { name: "Ativar tema claro" }).click();
    await expect.poll(() => htmlTheme(other.page)).toBe("light");
    await expect.poll(() => themeInDb(mail)).toBe("LIGHT");
    await other.page.reload();
    expect(await htmlTheme(other.page)).toBe("light");
    await other.context.close();

    // E um terceiro navegador entra em claro (a escolha salva agora é LIGHT).
    const third = await loginInFreshContext(browser, mail);
    expect(await htmlTheme(third.page)).toBe("light");
    await third.context.close();

    expect(errors, `Erros de console: ${errors.join(" | ")}`).toEqual([]);
    await context.close();
  });

  test("legado: localStorage 'dark' + sem escolha no banco => vai para o banco e para o cookie, e o item antigo é removido", async ({ browser }) => {
    test.setTimeout(120_000);
    const mail = email("tema-legado");
    const context = await browser.newContext();
    const page = await context.newPage();
    await gotoHydrated(page, "/login");
    await page.evaluate(() => localStorage.setItem("theme", "dark")); // como o mecanismo antigo guardava

    await registerAndOnboard(page, mail); // o dashboard é a primeira carga do app autenticado

    await expect.poll(() => themeInDb(mail)).toBe("DARK");
    await expect.poll(() => htmlTheme(page)).toBe("dark");
    expect((await context.cookies()).find((c) => c.name === "theme")?.value).toBe("dark");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBeNull(); // removido depois de gravar
    await context.close();
  });

  test("legado: a escolha já salva no banco vence o localStorage antigo, que só é removido", async ({ browser }) => {
    test.setTimeout(120_000);
    const mail = email("tema-legado2");
    const context = await browser.newContext();
    const page = await context.newPage();
    await registerAndOnboard(page, mail);
    await prisma.user.update({ where: { email: mail }, data: { themePreference: "LIGHT" } });

    await page.evaluate(() => localStorage.setItem("theme", "dark"));
    await page.reload();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBeNull();
    expect(await htmlTheme(page)).toBe("light");
    expect(await themeInDb(mail)).toBe("LIGHT");
    await context.close();
  });
});
