import { test, expect, type Page } from "@playwright/test";
import { gotoHydrated } from "./helpers/hydration";
import { createOnboardedUser, newTestPrisma } from "./helpers/session";
import { assertTestDatabase, loadTestEnv } from "../testEnv";

// Contraparte, no navegador, da trava contra rastreamento (tests/unit/noTrackers.test.ts): ao
// carregar as telas, NENHUMA requisicao (script, imagem, fonte, XHR/fetch, beacon, iframe,
// websocket) sai para outra origem. Rastreador, mapa, CDN ou fonte externa quebraria aqui.
loadTestEnv();
assertTestDatabase();
const prisma = newTestPrisma();
const createdUserIds: string[] = [];

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

function watchExternal(page: Page, baseURL: string) {
  const origin = new URL(baseURL).origin;
  const external: string[] = [];
  let total = 0;
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("about:")) return;
    total++;
    if (new URL(url).origin !== origin) external.push(`${request.resourceType()} ${url}`);
  });
  page.on("websocket", (ws) => {
    total++;
    // O websocket do hot reload do `next dev` e do proprio host; qualquer outro e externo.
    if (new URL(ws.url().replace(/^ws/, "http")).host !== new URL(origin).host) external.push(`websocket ${ws.url()}`);
  });
  return { external, total: () => total };
}

const PUBLIC_PAGES = ["/", "/login", "/register", "/forgot-password", "/privacidade", "/termos", "/cookies", "/tokushoho"];
const APP_PAGES = ["/dashboard", "/financeiro/receitas", "/financeiro/pagar", "/financeiro/importar", "/agenda", "/agenda/novo", "/vendas", "/vendas/nova", "/clientes", "/caixa", "/insights", "/configuracoes"];

test.describe("nenhuma requisição sai do próprio site", () => {
  test("telas públicas (landing, login, cadastro, recuperação e páginas legais)", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext();
    const page = await context.newPage();
    const watch = watchExternal(page, baseURL!);
    for (const path of PUBLIC_PAGES) await gotoHydrated(page, path);
    expect(watch.total(), "sanidade: o monitor viu requisicoes").toBeGreaterThan(PUBLIC_PAGES.length);
    expect(watch.external, "requisicoes para outra origem").toEqual([]);
    await context.close();
  });

  test("telas do app logado", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const user = await createOnboardedUser(prisma, "extreq");
    createdUserIds.push(user.userId);
    const context = await browser.newContext();
    await user.signIn(context, baseURL!);
    const page = await context.newPage();
    const watch = watchExternal(page, baseURL!);
    for (const path of APP_PAGES) await gotoHydrated(page, path);
    expect(watch.total(), "sanidade: o monitor viu requisicoes").toBeGreaterThan(APP_PAGES.length);
    expect(watch.external, "requisicoes para outra origem").toEqual([]);
    await context.close();
  });

  test("controle: o monitor enxerga uma requisição externa provocada", async ({ browser, baseURL }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const watch = watchExternal(page, baseURL!);
    await gotoHydrated(page, "/login");
    expect(watch.external).toEqual([]);
    // Host .invalid nunca resolve: nada sai da maquina, mas a requisicao e disparada e vista.
    await page.evaluate(() => {
      const img = new Image();
      img.src = "https://monitor-controle.invalid/pixel.gif";
    });
    await expect.poll(() => watch.external.length).toBeGreaterThan(0);
    expect(watch.external[0]).toContain("monitor-controle.invalid");
    await context.close();
  });
});
