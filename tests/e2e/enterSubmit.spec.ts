import { test, expect, type Page, type Browser } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { gotoHydrated } from "./helpers/hydration";
import { newTestPrisma } from "./helpers/session";
import { assertTestDatabase, loadTestEnv } from "../testEnv";
import { hashPassword } from "@/lib/auth/password";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { currentAcceptanceData } from "@/lib/legal/acceptance";

// Enter no ULTIMO campo de um formulario envia UMA vez (como em sites comuns), sem segundo Enter nem clique; e o
// botao "mostrar/ocultar senha". Conta as requisicoes que de fato saem do navegador.
loadTestEnv();
assertTestDatabase();
const prisma = newTestPrisma();
const PASSWORD = "SenhaValida123";
const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;

let loginEmail: string;
let loginUserId: string;

// Usuario real (senha com hash) com empresa pronta. O c5 troca a senha, por isso usa um usuario so dele.
async function createLoginUser(prefix: string) {
  const email = unique(prefix);
  const user = await prisma.user.create({
    data: { name: "Enter Submit", email, passwordHash: await hashPassword(PASSWORD), ...currentAcceptanceData() },
  });
  await prisma.business.create({ data: { userId: user.id, name: "Empresa Enter Submit", onboardingCompleted: true } });
  return { email, userId: user.id };
}

let settingsUserId: string;

test.beforeAll(async () => {
  const main = await createLoginUser("enter-submit");
  loginEmail = main.email;
  loginUserId = main.userId;
  settingsUserId = (await createLoginUser("enter-submit-cfg")).userId;
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [loginUserId, settingsUserId] } } });
  await prisma.$disconnect();
});

// Conta as requisicoes (metodo + trecho da URL) feitas pela pagina.
function countRequests(page: Page, method: string, urlPart: string) {
  let n = 0;
  page.on("request", (r) => {
    if (r.method() === method && r.url().includes(urlPart)) n++;
  });
  return () => n;
}

// Segura a resposta por 700 ms: o segundo Enter chega com o envio ainda pendente.
async function slowDown(page: Page, urlPart: string) {
  await page.route(`**${urlPart}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });
}

async function signedInPage(browser: Browser, baseURL: string, userId: string) {
  const context = await browser.newContext();
  const { token } = await createSession(userId, false);
  await context.addCookies([
    { name: SESSION_COOKIE_NAME, value: token, url: baseURL },
    { name: "cookie-notice", value: "1", url: baseURL },
  ]);
  return { context, page: await context.newPage() };
}

test.describe("Enter no último campo envia uma vez", () => {
  test("a) /login: e-mail + senha, um único Enter na senha -> entra, com exatamente 1 requisição de login", async ({ page }) => {
    const logins = countRequests(page, "POST", "/api/auth/login");
    await gotoHydrated(page, "/login");
    await page.getByLabel("E-mail").fill(loginEmail);
    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.keyboard.press("Enter"); // foco esta na senha (ultimo campo)
    await expect.poll(logins, { message: "requisicoes de login depois de UM Enter" }).toBe(1);
    await expect(page).toHaveURL(/\/dashboard/);
    expect(logins()).toBe(1);
  });

  test("b) /login: Enter duas vezes rápido (envio ainda pendente) -> continua exatamente 1 requisição", async ({ page }) => {
    await slowDown(page, "/api/auth/login");
    const logins = countRequests(page, "POST", "/api/auth/login");
    await gotoHydrated(page, "/login");
    await page.getByLabel("E-mail").fill(loginEmail);
    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Entrando..." })).toBeDisabled(); // pendente: botao desabilitado
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/dashboard/);
    expect(logins()).toBe(1);
  });

  test("c1) /register: Enter em 'Confirmar senha' cadastra uma vez", async ({ page }) => {
    const registers = countRequests(page, "POST", "/api/auth/register");
    await gotoHydrated(page, "/register");
    await page.getByLabel("Nome").fill("Cadastro Enter");
    await page.getByLabel("E-mail").fill(unique("enter-reg"));
    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.getByLabel(/li e aceito/i).check();
    await page.getByLabel("Confirmar senha").fill(PASSWORD);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/onboarding/);
    expect(registers()).toBe(1);
  });

  test("c2) /forgot-password: Enter no e-mail envia uma vez", async ({ page }) => {
    await slowDown(page, "/api/auth/forgot-password");
    const posts = countRequests(page, "POST", "/api/auth/forgot-password");
    await gotoHydrated(page, "/forgot-password");
    await page.getByLabel("E-mail").fill(loginEmail);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Enviando..." })).toBeDisabled();
    await expect.poll(posts).toBe(1);
    await page.waitForTimeout(1200);
    expect(posts()).toBe(1);
  });

  test("c3) /reset-password/[token]: Enter em 'Confirmar senha' envia uma vez", async ({ page }) => {
    await slowDown(page, "/api/auth/reset-password");
    const posts = countRequests(page, "POST", "/api/auth/reset-password");
    await gotoHydrated(page, "/reset-password/token-invalido-e2e");
    await page.getByLabel("Nova senha", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirmar nova senha").fill(PASSWORD);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect.poll(posts).toBe(1);
    await page.waitForTimeout(1200);
    expect(posts()).toBe(1);
  });

  test("c4) modal de reautenticação: Enter na senha confirma uma vez", async ({ browser, baseURL }) => {
    const { context, page } = await signedInPage(browser, baseURL!, loginUserId);
    const business = await prisma.business.findUniqueOrThrow({ where: { userId: loginUserId } });
    const category = await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE", name: "Venda de produtos" } });
    const today = new Date();
    await prisma.financialEntry.create({
      data: { businessId: business.id, userId: loginUserId, type: "REVENUE", categoryId: category.id, description: "Lancamento Reauth Enter", amount: "10", occurredOn: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) },
    });
    const reauths = countRequests(page, "POST", "/api/auth/reauth");
    await slowDown(page, "/api/auth/reauth");
    await gotoHydrated(page, "/financeiro/receitas?period=LAST_90_DAYS");
    await page.getByRole("row", { name: /Lancamento Reauth Enter/ }).getByRole("button", { name: "Excluir" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Confirme sua senha" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect.poll(reauths).toBe(1);
    await page.waitForTimeout(1200);
    expect(reauths()).toBe(1);
    await context.close();
  });

  test("c5) Configurações: Enter no último campo de 'Perfil' e de 'Alterar senha' envia uma vez cada", async ({ browser, baseURL }) => {
    const { context, page } = await signedInPage(browser, baseURL!, settingsUserId);
    const profile = countRequests(page, "PATCH", "/api/account/profile");
    const password = countRequests(page, "POST", "/api/auth/change-password");
    await gotoHydrated(page, "/configuracoes");

    const profileForm = page.locator("form").filter({ has: page.getByLabel("E-mail") }).first();
    await profileForm.getByLabel("Nome").fill("Enter Perfil Novo");
    await profileForm.getByLabel("E-mail").focus();
    await page.keyboard.press("Enter");
    await expect.poll(profile).toBe(1);

    const passwordForm = page.locator("form").filter({ has: page.getByLabel("Confirmar nova senha") });
    await passwordForm.getByLabel("Senha atual").fill(PASSWORD);
    await passwordForm.getByLabel("Nova senha", { exact: true }).fill("OutraSenha1234");
    await passwordForm.getByLabel("Confirmar nova senha").fill("OutraSenha1234");
    await page.keyboard.press("Enter");
    await expect.poll(password).toBe(1);

    await page.waitForTimeout(1000);
    expect([profile(), password()]).toEqual([1, 1]);
    await context.close();
  });

  test("e) textarea: Enter quebra a linha e não envia (Nova receita)", async ({ browser, baseURL }) => {
    const { context, page } = await signedInPage(browser, baseURL!, loginUserId);
    const posts = countRequests(page, "POST", "/api/financeiro/transactions");
    await gotoHydrated(page, "/financeiro/receitas");
    await page.getByRole("button", { name: "Nova receita" }).click();
    const dialog = page.getByRole("dialog");
    const notes = dialog.getByLabel("Observação (opcional)");
    await notes.fill("linha 1");
    await notes.press("Enter");
    await notes.pressSequentially("linha 2");
    await expect(notes).toHaveValue("linha 1\nlinha 2");
    await page.waitForTimeout(500);
    await expect(dialog).toBeVisible();
    expect(posts()).toBe(0);
    await context.close();
  });
});

test.describe("mostrar/ocultar senha", () => {
  test("d) /login: o olho alterna password/text, mantém o valor e o foco no campo, e Enter ainda envia uma vez", async ({ page }) => {
    const logins = countRequests(page, "POST", "/api/auth/login");
    await gotoHydrated(page, "/login");
    const input = page.getByLabel("Senha", { exact: true });
    const eye = page.getByRole("button", { name: "Mostrar senha" });
    await input.fill(PASSWORD);
    await expect(input).toHaveAttribute("type", "password");
    await expect(eye).not.toHaveAttribute("aria-pressed");

    await eye.click();
    await expect(input).toHaveAttribute("type", "text");
    await expect(input).toHaveValue(PASSWORD);
    await expect(input).toBeFocused();
    const hide = page.getByRole("button", { name: "Ocultar senha" });
    await expect(hide).not.toHaveAttribute("aria-pressed");
    await expect(hide).toHaveAttribute("aria-controls", (await input.getAttribute("id"))!);
    expect(logins()).toBe(0); // clicar no olho nao envia

    await hide.click();
    await expect(input).toHaveAttribute("type", "password");
    await expect(input).toHaveValue(PASSWORD);
    await expect(input).toBeFocused();

    await page.getByLabel("E-mail").fill(loginEmail);
    await eye.click(); // visivel de novo...
    await input.focus();
    await page.keyboard.press("Enter"); // ...ao enviar volta para password
    await expect(page).toHaveURL(/\/dashboard/);
    expect(logins()).toBe(1);
  });

  test("d2) o cursor não muda de posição ao alternar", async ({ page }) => {
    await gotoHydrated(page, "/login");
    const input = page.getByLabel("Senha", { exact: true });
    await input.fill("abcdefgh");
    await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(3, 3));
    await page.getByRole("button", { name: "Mostrar senha" }).click();
    expect(await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([3, 3]);
    await input.pressSequentially("X");
    await expect(input).toHaveValue("abcXdefgh");
  });

  test("d3) o botão é alcançável por Tab e funciona por teclado sem enviar", async ({ page }) => {
    const logins = countRequests(page, "POST", "/api/auth/login");
    await gotoHydrated(page, "/login");
    const input = page.getByLabel("Senha", { exact: true });
    await input.fill(PASSWORD);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Mostrar senha" })).toBeFocused();
    await page.keyboard.press("Enter"); // Enter no botao: ativa o botao (nao a navegacao de campos)
    await expect(input).toHaveAttribute("type", "text");
    await page.keyboard.press("Space");
    await expect(input).toHaveAttribute("type", "password");
    expect(logins()).toBe(0);
  });

  test("d4) cadastro: cada campo de senha tem o seu olho", async ({ page }) => {
    await gotoHydrated(page, "/register");
    await expect(page.getByRole("button", { name: "Mostrar senha" })).toHaveCount(2);
    await page.getByRole("button", { name: "Mostrar senha" }).first().click();
    await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute("type", "text");
    await expect(page.getByLabel("Confirmar senha")).toHaveAttribute("type", "password");
  });
});

// axe (WCAG 2.0/2.1/2.2 A e AA): 0 violacoes nas telas de autenticacao com o botao de mostrar senha, nos dois temas,
// com a senha oculta e visivel.
test.describe("axe: botão mostrar/ocultar senha", () => {
  const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
  for (const theme of ["light", "dark"] as const) {
    for (const path of ["/login", "/register", "/reset-password/token-axe-e2e"]) {
      test(`${path} — tema ${theme}: 0 violações (senha oculta e visível)`, async ({ browser, baseURL }) => {
        const context = await browser.newContext();
        await context.addCookies([
          { name: "theme", value: theme, url: baseURL! },
          { name: "cookie-notice", value: "1", url: baseURL! },
        ]);
        const page = await context.newPage();
        await gotoHydrated(page, path);
        const scan = async (state: string) => {
          const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
          expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`), `${path} ${theme} ${state}`).toEqual([]);
        };
        await scan("senha oculta");
        // Cada clique troca o nome do botao ("Mostrar" -> "Ocultar"): clica sempre no primeiro que ainda esta oculto.
        while ((await page.getByRole("button", { name: "Mostrar senha" }).count()) > 0) await page.getByRole("button", { name: "Mostrar senha" }).first().click();
        await expect(page.getByRole("button", { name: "Ocultar senha" })).not.toHaveCount(0);
        await scan("senha visível");
        await context.close();
      });
    }
  }
});

// Envio que dá certo e navega: o botão fica travado até a tela trocar (nenhum Enter/clique no intervalo manda um
// segundo envio); envio com erro destrava o botão e dá para tentar de novo.
test.describe("botão travado até a tela trocar", () => {
  // Amostra, a cada 10 ms, se o botao de envio esta HABILITADO enquanto a URL ainda e a da tela de origem.
  async function armWatch(page: Page) {
    await page.evaluate(() => {
      const w = window as unknown as { __enabled?: string[]; __armed?: boolean };
      w.__enabled = [];
      w.__armed = false;
      const origin = location.pathname;
      setInterval(() => {
        if (!w.__armed || location.pathname !== origin) return;
        const button = document.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (button && !button.disabled) w.__enabled!.push(button.textContent ?? "");
      }, 10);
    });
  }
  const startWatch = (page: Page) => page.evaluate(() => ((window as unknown as { __armed: boolean }).__armed = true));
  const enabledSamples = (page: Page) => page.evaluate(() => (window as unknown as { __enabled: string[] }).__enabled);

  test("a) login com sucesso: Enter, botão desabilitado até a URL mudar, 2º Enter no intervalo não gera 2º login", async ({ page }) => {
    await slowDown(page, "/api/auth/login");
    const logins = countRequests(page, "POST", "/api/auth/login");
    await gotoHydrated(page, "/login");
    await page.getByLabel("E-mail").fill(loginEmail);
    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await armWatch(page);
    await page.keyboard.press("Enter");
    await startWatch(page);
    await expect(page.getByRole("button", { name: "Entrando..." })).toBeDisabled();
    await page.keyboard.press("Enter"); // 2o Enter com a resposta ainda pendente
    await expect(page).toHaveURL(/\/dashboard/);
    await page.keyboard.press("Enter"); // e depois que a tela trocou: nada a enviar
    expect(await enabledSamples(page), "o botao nao pode ter sido reabilitado antes da URL mudar").toEqual([]);
    expect(logins()).toBe(1);
  });

  test("b) login com senha errada: o botão destrava, a mensagem aparece e dá para tentar de novo", async ({ page }) => {
    const logins = countRequests(page, "POST", "/api/auth/login");
    await gotoHydrated(page, "/login");
    await page.getByLabel("E-mail").fill(loginEmail);
    await page.getByLabel("Senha", { exact: true }).fill("SenhaErrada999");
    await page.keyboard.press("Enter");
    await expect(page.locator('p[role="alert"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeEnabled();
    await expect(page).toHaveURL(/\/login/);
    expect(logins()).toBe(1);

    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.keyboard.press("Enter"); // tentar de novo
    await expect(page).toHaveURL(/\/dashboard/);
    expect(logins()).toBe(2);
  });

  async function fillRegister(page: Page, email: string) {
    await page.getByLabel("Nome").fill("Trava Cadastro");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirmar senha").fill(PASSWORD);
    await page.getByLabel(/li e aceito/i).check();
  }

  test("c1) cadastro com sucesso: botão desabilitado até a URL mudar e 1 única requisição", async ({ page }) => {
    await slowDown(page, "/api/auth/register");
    const registers = countRequests(page, "POST", "/api/auth/register");
    await gotoHydrated(page, "/register");
    await fillRegister(page, unique("trava-cad"));
    await armWatch(page);
    await page.getByLabel("Confirmar senha").press("Enter");
    await startWatch(page);
    await expect(page.getByRole("button", { name: "Criando conta..." })).toBeDisabled();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/onboarding/);
    expect(await enabledSamples(page)).toEqual([]);
    expect(registers()).toBe(1);
  });

  test("c2) cadastro com e-mail já usado: o botão destrava, a mensagem aparece e dá para tentar de novo", async ({ page }) => {
    const registers = countRequests(page, "POST", "/api/auth/register");
    await gotoHydrated(page, "/register");
    await fillRegister(page, loginEmail); // ja cadastrado
    await page.getByLabel("Confirmar senha").press("Enter");
    await expect(page.locator('p[role="alert"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar conta" })).toBeEnabled();
    await expect(page).toHaveURL(/\/register/);
    expect(registers()).toBe(1);

    await page.getByLabel("E-mail").fill(unique("trava-cad2"));
    await page.getByLabel("Confirmar senha").press("Enter");
    await expect(page).toHaveURL(/\/onboarding/);
    expect(registers()).toBe(2);
  });
});
