import { test, expect, type Browser, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { gotoHydrated } from "./helpers/hydration";
import { fillMoney } from "./helpers/money";
import { assertTestDatabase, loadTestEnv } from "../testEnv";

// Páginas legais públicas (rascunho), links, aviso de cookies e aceite no cadastro.
loadTestEnv();
assertTestDatabase();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const PASSWORD = "SenhaValida123";
const DRAFT = "Rascunho — em revisão";

const email = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;

// Contexto novo = visitante na primeira visita (sem nenhum cookie).
async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

async function registerThroughForm(page: Page, mail: string, accept: boolean) {
  await gotoHydrated(page, "/register");
  await page.getByLabel("Nome").fill("Dono Legal E2E");
  await page.getByLabel("E-mail").fill(mail);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmar senha").fill(PASSWORD);
  if (accept) await page.getByLabel(/Li e aceito/).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
}

async function onboard(page: Page) {
  await page.getByRole("button", { name: "Loja", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Venda de produtos", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Nome da empresa").fill("Empresa Legal E2E");
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

const legalNav = (page: Page) => page.getByRole("navigation", { name: "Documentos legais" });

test.describe("páginas legais (públicas, rascunho)", () => {
  test("/privacidade, /termos, /cookies e /tokushoho abrem sem login, com a faixa de rascunho, versão e seções", async ({ browser }) => {
    const { context, page } = await freshPage(browser);
    const pages = [
      { path: "/privacidade", title: "Política de Privacidade", section: "4. Compartilhamento e envio a terceiros", version: "0.2" },
      { path: "/termos", title: "Termos de Serviço", section: "6. Assinatura", version: "0.2" },
      { path: "/cookies", title: "Cookies", section: "2. O que usamos", version: "0.1" },
      { path: "/tokushoho", title: "特定商取引法に基づく表記", section: "表示事項 / Informações do vendedor", version: "0.1" },
    ];
    for (const p of pages) {
      const res = await page.goto(p.path);
      expect(res?.status()).toBe(200); // sem redirecionamento para o login
      await expect(page).toHaveURL(new RegExp(`${p.path}$`));
      await expect(page.getByRole("heading", { level: 1, name: p.title })).toBeVisible();
      await expect(page.getByTestId("legal-draft-banner")).toHaveText(DRAFT);
      await expect(page.getByTestId("legal-version")).toContainText(`Versão ${p.version}`);
      await expect(page.getByRole("heading", { level: 2, name: p.section })).toBeVisible();
      await expect(legalNav(page)).toBeVisible(); // links cruzados entre as três páginas
    }
    await context.close();
  });

  test("a Política e os Termos mostram os campos a preencher e as notas para o advogado", async ({ browser }) => {
    const { context, page } = await freshPage(browser);
    await page.goto("/privacidade");
    await expect(page.getByText("[PREENCHER: e-mail de contato de privacidade]")).toBeVisible();
    await expect(page.getByText(/\[VERIFICAR COM ADVOGADO:[^\]]*LGPD/)).toBeVisible();
    await page.goto("/termos");
    await expect(page.getByText(/\[PREENCHER: lei aplicável/)).toBeVisible();
    await expect(page.getByText(/\[PREENCHER: idade mínima/).first()).toBeVisible();
    await context.close();
  });

  test("os Termos têm a seção de assinatura (substituiu planos/pagamento) e a Política, o provedor de cobrança", async ({ browser }) => {
    const { context, page } = await freshPage(browser);
    await page.goto("/termos");
    await expect(page.getByRole("heading", { level: 2, name: "6. Assinatura" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Planos e pagamento/ })).toHaveCount(0);
    for (const marker of [/\[PREENCHER: planos disponíveis/, /\[PREENCHER: mensal, anual ou ambos\]/, /\[PREENCHER: existe período de teste/, /\[PREENCHER: prazo para regularizar/, /\[PREENCHER: prazo do aviso prévio/, /\[PREENCHER: por quantos dias/]) {
      await expect(page.getByText(marker)).toBeVisible();
    }
    await expect(page.getByText(/\[VERIFICAR COM ADVOGADO:[^\]]*reembolso/)).toBeVisible();
    await expect(page.getByText(/renova automaticamente/)).toBeVisible();
    const toTokushoho = page.locator("article").getByText(/página 特定商取引法に基づく表記/);
    await expect(toTokushoho).toBeVisible();

    await page.goto("/privacidade");
    await expect(page.getByText("Os dados do cartão são enviados diretamente ao provedor e NÃO são armazenados pelo Serviço.")).toBeVisible();
    await expect(page.getByText("[PREENCHER: nome do provedor].")).toBeVisible();
    await expect(page.getByText(/Cobrança da assinatura: \[PREENCHER: provedor de cobrança e país\]/)).toBeVisible();
    await context.close();
  });

  test("/tokushoho: título em japonês, subtítulo em português e os 12 itens em japonês e português, todos a preencher", async ({ browser }) => {
    const { context, page } = await freshPage(browser);
    const res = await page.goto("/tokushoho");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("特定商取引法に基づく表記");
    await expect(page.getByText("Informações conforme a Lei de Transações Comerciais Específicas (Japão)")).toBeVisible();
    await expect(page.getByTestId("legal-draft-banner")).toHaveText(DRAFT);

    const rows = page.getByTestId("tokushoho-table").locator("tbody tr");
    await expect(rows).toHaveCount(12);
    const items = [
      ["販売事業者", "Vendedor (razão social)"],
      ["運営責任者", "Responsável pela operação"],
      ["所在地", "Endereço"],
      ["電話番号", "Telefone"],
      ["メールアドレス", "E-mail"],
      ["販売価格", "Preço de venda"],
      ["商品代金以外の必要料金", "Outras taxas além do preço"],
      ["支払方法", "Forma de pagamento"],
      ["支払時期", "Quando é cobrado"],
      ["役務の提供時期", "Início do serviço"],
      ["返品・キャンセル", "Cancelamento e reembolso"],
      ["動作環境", "Ambiente de funcionamento"],
    ];
    for (const [i, [jp, pt]] of items.entries()) {
      const row = rows.nth(i);
      await expect(row.getByRole("rowheader")).toContainText(jp);
      await expect(row.getByRole("rowheader")).toContainText(pt);
      const cells = row.getByRole("cell");
      await expect(cells).toHaveCount(2); // conteúdo em japonês e em português
      await expect(cells.nth(0)).toContainText("[PREENCHER:");
      await expect(cells.nth(1)).toContainText("[PREENCHER:");
    }
    // Telefone: só vale omitir com aval do advogado.
    await expect(rows.nth(3)).toContainText("[VERIFICAR COM ADVOGADO:");
    await expect(rows.nth(3)).toContainText("fornecido sem demora mediante solicitação");
    await context.close();
  });

  test("/cookies: a tabela lista exatamente o que o sistema grava, sem análise nem publicidade", async ({ browser }) => {
    const { context, page } = await freshPage(browser);
    await page.goto("/cookies");
    const rows = page.getByTestId("cookie-table").locator("tbody tr");
    await expect(rows).toHaveCount(4);
    for (const name of ["session", "theme", "cookie-notice", "sidebar-collapsed"]) {
      await expect(page.getByTestId("cookie-table").getByRole("cell", { name, exact: true })).toBeVisible();
    }
    await expect(page.getByTestId("cookie-table")).toContainText("HttpOnly");
    await expect(page.getByText(/análise de acesso, publicidade ou rastreamento de terceiros: não são usados/)).toBeVisible();
    await expect(page.getByText(/podem ser desativados sem prejudicar/)).toBeVisible();
    await context.close();
  });
});

test.describe("links dos documentos legais", () => {
  test("rodapé da landing e das telas de login, cadastro e recuperação de senha", async ({ browser }) => {
    const { context, page } = await freshPage(browser);
    for (const path of ["/", "/login", "/register", "/forgot-password"]) {
      await gotoHydrated(page, path);
      const nav = legalNav(page);
      await expect(nav.getByRole("link", { name: "Privacidade" })).toHaveAttribute("href", "/privacidade");
      await expect(nav.getByRole("link", { name: "Termos" })).toHaveAttribute("href", "/termos");
      await expect(nav.getByRole("link", { name: "Cookies" })).toHaveAttribute("href", "/cookies");
      await expect(nav.getByRole("link", { name: "特定商取引法に基づく表記" })).toHaveAttribute("href", "/tokushoho");
    }
    // Também no rodapé de cada página legal.
    for (const path of ["/privacidade", "/termos", "/cookies", "/tokushoho"]) {
      await page.goto(path);
      await expect(legalNav(page).getByRole("link", { name: "特定商取引法に基づく表記" })).toHaveAttribute("href", "/tokushoho");
    }
    await gotoHydrated(page, "/login");
    await legalNav(page).getByRole("link", { name: "特定商取引法に基づく表記" }).click();
    await expect(page).toHaveURL(/\/tokushoho$/);
    await gotoHydrated(page, "/login");
    await legalNav(page).getByRole("link", { name: "Termos" }).click();
    await expect(page).toHaveURL(/\/termos$/);
    await context.close();
  });

  test("dentro do app: Configurações tem a área 'Documentos legais'", async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page } = await freshPage(browser);
    await registerThroughForm(page, email("legal-app"), true);
    await onboard(page);
    await gotoHydrated(page, "/configuracoes");
    await expect(page.getByRole("heading", { name: "Documentos legais" })).toBeVisible();
    const nav = legalNav(page);
    await expect(nav.getByRole("link", { name: "Privacidade" })).toHaveAttribute("href", "/privacidade");
    await expect(nav.getByRole("link", { name: "Termos" })).toHaveAttribute("href", "/termos");
    await expect(nav.getByRole("link", { name: "Cookies" })).toHaveAttribute("href", "/cookies");
    await expect(nav.getByRole("link", { name: "特定商取引法に基づく表記" })).toHaveAttribute("href", "/tokushoho");
    await context.close();
  });
});

test.describe("aviso de cookies", () => {
  test("aparece na primeira visita, 'Entendi' dispensa e não volta ao recarregar nem em outras páginas", async ({ browser }) => {
    const { context, page } = await freshPage(browser);
    await gotoHydrated(page, "/");
    const notice = page.getByRole("region", { name: "Aviso de cookies" });
    await expect(notice).toBeVisible();
    await expect(notice.getByRole("link", { name: "Saiba mais" })).toHaveAttribute("href", "/cookies");
    await expect(notice.getByRole("button", { name: "Entendi" })).toBeVisible();
    // Não é consentimento: nada de aceitar/recusar.
    await expect(notice.getByRole("button")).toHaveCount(1);
    await expect(notice).not.toContainText(/recusar|rejeitar|aceitar/i);

    // Teclado: o botão recebe foco e Enter dispensa.
    await notice.getByRole("button", { name: "Entendi" }).focus();
    await expect(notice.getByRole("button", { name: "Entendi" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(notice).toHaveCount(0);
    expect((await context.cookies()).find((c) => c.name === "cookie-notice")?.value).toBe("1");

    await page.reload();
    await expect(page.getByRole("region", { name: "Aviso de cookies" })).toHaveCount(0);
    await gotoHydrated(page, "/login");
    await expect(page.getByRole("region", { name: "Aviso de cookies" })).toHaveCount(0);
    await context.close();

    // Outro navegador (sem o cookie): volta a aparecer.
    const other = await freshPage(browser);
    await gotoHydrated(other.page, "/login");
    await expect(other.page.getByRole("region", { name: "Aviso de cookies" })).toBeVisible();
    await other.context.close();
  });

  test("no app aparece uma vez e fica ao lado da barra lateral, sem cobrir os botões dela", async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page } = await freshPage(browser);
    await registerThroughForm(page, email("legal-notice"), true);
    await onboard(page);
    const notice = page.getByRole("region", { name: "Aviso de cookies" });
    await expect(notice).toBeVisible();
    const sidebarBox = (await page.locator("aside").boundingBox())!;
    const noticeBox = (await notice.boundingBox())!;
    expect(noticeBox.x).toBeGreaterThanOrEqual(sidebarBox.width - 1); // começa depois da barra lateral
    // E o botão "Sair" da barra lateral continua clicável (não fica sob o aviso).
    const logoutBox = (await page.getByRole("button", { name: "Sair" }).boundingBox())!;
    expect(logoutBox.x + logoutBox.width).toBeLessThanOrEqual(noticeBox.x + 1);
    await notice.getByRole("button", { name: "Entendi" }).click();
    await page.reload();
    await expect(page.getByRole("region", { name: "Aviso de cookies" })).toHaveCount(0);
    await context.close();
  });

  test("no celular o aviso é compacto (não ocupa mais de um quarto da tela)", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 700 } });
    const page = await context.newPage();
    await gotoHydrated(page, "/login");
    const box = (await page.getByRole("region", { name: "Aviso de cookies" }).boundingBox())!;
    expect(box.height).toBeLessThan(700 / 4);
    expect(box.y + box.height).toBeGreaterThan(700 - 2); // fixo na base
    await context.close();
  });
});

test.describe("aceite dos Termos e da Política no cadastro", () => {
  test("a caixa é obrigatória: sem marcar o cadastro é recusado e nada é criado; os links abrem em nova aba", async ({ browser }) => {
    const { context, page } = await freshPage(browser);
    const mail = email("legal-sem");
    await registerThroughForm(page, mail, false);
    await expect(page.locator('p[role="alert"]')).toHaveText("Aceite os Termos de Serviço e a Política de Privacidade para criar a conta.");
    await expect(page).toHaveURL(/\/register/);
    expect(await prisma.user.count({ where: { email: mail } })).toBe(0);

    await expect(page.getByLabel(/Li e aceito/)).not.toBeChecked();
    const terms = page.getByLabel(/Li e aceito/).locator("xpath=ancestor::label").getByRole("link", { name: "Termos de Serviço" });
    const privacy = page.getByLabel(/Li e aceito/).locator("xpath=ancestor::label").getByRole("link", { name: "Política de Privacidade" });
    for (const link of [terms, privacy]) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", /noopener/);
    }
    await expect(terms).toHaveAttribute("href", "/termos");
    await expect(privacy).toHaveAttribute("href", "/privacidade");
    await context.close();
  });

  test("o servidor também recusa (API sem aceite -> 400) e com aceite grava data e versões", async ({ browser }) => {
    const { context, page } = await freshPage(browser);
    const bad = await page.request.post("/api/auth/register", { data: { name: "Sem Aceite", email: email("legal-api-sem"), password: PASSWORD, confirmPassword: PASSWORD } });
    expect(bad.status()).toBe(400);

    const mail = email("legal-ok");
    const before = Date.now();
    await registerThroughForm(page, mail, true);
    await expect(page).toHaveURL(/\/onboarding|\/dashboard/);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    expect([user.termsVersion, user.privacyVersion]).toEqual(["0.2", "0.2"]);
    expect(user.legalAcceptedAt).not.toBeNull();
    expect(user.legalAcceptedAt!.getTime()).toBeGreaterThanOrEqual(before - 5000);
    await context.close();
  });
});
