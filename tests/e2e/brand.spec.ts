import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { gotoHydrated } from "./helpers/hydration";
import { createOnboardedUser, newTestPrisma } from "./helpers/session";
import { assertTestDatabase, loadTestEnv } from "../testEnv";
import { BRAND_NAME } from "@/lib/brand";

// Marca MyWallet: título, ícones, logo (nome acessível, cor, nos dois temas e no celular) e ids únicos.
loadTestEnv();
assertTestDatabase();
const prisma = newTestPrisma();
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

// Hash dos arquivos de ícone entregues pelo dono (os mesmos de mywallet-brand/): o que o servidor serve tem de ser idêntico.
const ICON_SHA256 = {
  "/icon.svg": "0ff285d97af1047f14c9f7962828fceb0a7d95eb06902441ed216d19eed460b7",
  "/favicon.ico": "e7c07c6beb1be1d5f0819fae180273796f572468d9fecebec4953f57230049f7",
  "/apple-icon.png": "88fef98a0614218631a68c59fbd0017c2801824ffbfa68cffe894fe1c52fcffe",
} as const;

let appUser: Awaited<ReturnType<typeof createOnboardedUser>>;
let reacceptUser: Awaited<ReturnType<typeof createOnboardedUser>>;
let onboardingUser: Awaited<ReturnType<typeof createOnboardedUser>>;

test.beforeAll(async () => {
  appUser = await createOnboardedUser(prisma, "brand");
  // Aceite dos documentos desatualizado: o app leva este usuario a /reaceite (o servidor de teste liga o mecanismo).
  reacceptUser = await createOnboardedUser(prisma, "brand-reaceite");
  await prisma.user.update({ where: { id: reacceptUser.userId }, data: { termsVersion: "0.1", privacyVersion: "0.1" } });
  // Usuario SEM onboarding concluido, para a tela /onboarding.
  onboardingUser = await createOnboardedUser(prisma, "brand-onboarding");
  await prisma.business.update({ where: { userId: onboardingUser.userId }, data: { onboardingCompleted: false } });
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [appUser.userId, reacceptUser.userId, onboardingUser.userId] } } });
  await prisma.$disconnect();
});

async function newContext(
  browser: Browser,
  baseURL: string,
  theme: Theme,
  opts: { signedIn?: boolean; user?: typeof appUser; collapsed?: boolean; viewport?: { width: number; height: number } } = {}
): Promise<BrowserContext> {
  const context = await browser.newContext(opts.viewport ? { viewport: opts.viewport } : {});
  await context.addCookies([
    { name: "theme", value: theme, url: baseURL },
    { name: "cookie-notice", value: "1", url: baseURL },
  ]);
  if (opts.signedIn) await (opts.user ?? appUser).signIn(context, baseURL);
  if (opts.collapsed) await context.addInitScript(() => localStorage.setItem("sidebar-collapsed", "true"));
  return context;
}

// Cor escura da logo (currentColor = cor de texto herdada) e fundo efetivo atrás dela (camadas com transparência
// compostas de cima para baixo). Cores normalizadas pelo canvas (aceita rgb(), color(srgb ...), oklch...).
async function logoColors(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((svg) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const rgba = (css: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const layers: [number, number, number, number][] = [];
    for (let el: Element | null = svg; el; el = el.parentElement) {
      const bg = rgba(getComputedStyle(el).backgroundColor);
      if (bg[3] > 0) layers.push(bg);
    }
    let [r, g, b] = [255, 255, 255];
    for (const [lr, lg, lb, la] of layers.reverse()) {
      r = lr * la + r * (1 - la);
      g = lg * la + g * (1 - la);
      b = lb * la + b * (1 - la);
    }
    const [fr, fg, fb] = rgba(getComputedStyle(svg).color);
    const lum = (c: number[]) => {
      const [x, y, z] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * x + 0.7152 * y + 0.0722 * z;
    };
    const l1 = lum([fr, fg, fb]);
    const l2 = lum([r, g, b]);
    return {
      color: [fr, fg, fb].map(Math.round),
      background: [r, g, b].map(Math.round),
      contrast: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05),
    };
  });
}

async function accentColors(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((svg) => ({
    stroke: getComputedStyle(svg.querySelector(".stroke-ember")!).stroke,
    fill: getComputedStyle(svg.querySelector(".fill-ember") ?? svg.querySelector(".stroke-ember")!).fill,
  }));
}

async function duplicateIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const seen = new Map<string, number>();
    for (const el of document.querySelectorAll("[id]")) seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
    return [...seen].filter(([, n]) => n > 1).map(([id]) => id);
  });
}

test.describe("título da página termina com o nome da marca", () => {
  test("login, cadastro e /privacidade: '<página> · MyWallet'; landing: só o nome (sem título próprio)", async ({ page }) => {
    for (const path of ["/login", "/register", "/privacidade"]) {
      await gotoHydrated(page, path);
      await expect(page, path).toHaveTitle(new RegExp(`· ${BRAND_NAME}$`));
    }
    // A landing não define título próprio: vale o título padrão, que é o nome da marca.
    await gotoHydrated(page, "/");
    await expect(page).toHaveTitle(BRAND_NAME);
  });

  test("dashboard (logado): '<página> · MyWallet'", async ({ browser, baseURL }) => {
    const context = await newContext(browser, baseURL!, "light", { signedIn: true });
    const page = await context.newPage();
    await gotoHydrated(page, "/dashboard");
    await expect(page).toHaveTitle(new RegExp(`· ${BRAND_NAME}$`));
    await context.close();
  });
});

test.describe("ícones (convenção do App Router)", () => {
  test("/icon.svg, /favicon.ico e /apple-icon.png respondem 200, com o tipo certo e o conteúdo entregue pelo dono", async ({ page }) => {
    const types: Record<string, RegExp> = { "/icon.svg": /image\/svg\+xml/, "/favicon.ico": /image\/(x-icon|vnd\.microsoft\.icon)/, "/apple-icon.png": /image\/png/ };
    for (const path of Object.keys(ICON_SHA256) as (keyof typeof ICON_SHA256)[]) {
      const res = await page.request.get(path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()["content-type"], path).toMatch(types[path]);
      expect(createHash("sha256").update(await res.body()).digest("hex"), `${path}: o arquivo servido é o entregue`).toBe(ICON_SHA256[path]);
    }
  });

  test("o <head> aponta para os três ícones", async ({ page }) => {
    await gotoHydrated(page, "/login");
    const links = await page.evaluate(() => [...document.head.querySelectorAll("link[rel~='icon'], link[rel='apple-touch-icon']")].map((l) => ({ rel: l.getAttribute("rel"), href: l.getAttribute("href") ?? "" })));
    expect(links.some((l) => /^\/icon\.svg(\?|$)/.test(l.href) && /icon/.test(l.rel ?? "")), JSON.stringify(links)).toBe(true);
    expect(links.some((l) => /^\/favicon\.ico(\?|$)/.test(l.href)), JSON.stringify(links)).toBe(true);
    expect(links.some((l) => /^\/apple-icon\.png(\?|$)/.test(l.href) && l.rel === "apple-touch-icon"), JSON.stringify(links)).toBe(true);
  });
});

for (const theme of THEMES) {
  test.describe(`logo — tema ${theme}`, () => {
    test("landing (página): link com o nome 'MyWallet', logo completa visível; cor escura contrasta com o fundo; laranja pelo token", async ({ browser, baseURL }) => {
      const context = await newContext(browser, baseURL!, theme);
      const page = await context.newPage();
      await gotoHydrated(page, "/");
      const link = page.locator("header").getByRole("link", { name: BRAND_NAME });
      await expect(link).toBeVisible();
      await expect(link.locator('[data-brand="logo"]')).toBeVisible();
      await expect(link.locator('[data-brand="symbol"]')).toBeHidden();

      const colors = await logoColors(page, 'header [data-brand="logo"]');
      expect(colors.color, JSON.stringify(colors)).not.toEqual(colors.background);
      expect(colors.contrast, JSON.stringify(colors)).toBeGreaterThanOrEqual(3);
      expect(colors.color).toEqual(theme === "light" ? [17, 17, 17] : [242, 243, 245]); // #111111 no claro, cinza claro no escuro

      const accent = await accentColors(page, 'header [data-brand="logo"]');
      expect(accent).toEqual({ stroke: "rgb(217, 84, 30)", fill: "rgb(217, 84, 30)" }); // #D9541E (token --color-ember)
      expect(await duplicateIds(page)).toEqual([]);
      await context.close();
    });

    test("barra lateral EXPANDIDA (app): link 'MyWallet' com a logo completa; parte escura clara sobre a barra escura", async ({ browser, baseURL }) => {
      const context = await newContext(browser, baseURL!, theme, { signedIn: true });
      const page = await context.newPage();
      await gotoHydrated(page, "/dashboard");
      const link = page.locator("aside").getByRole("link", { name: BRAND_NAME });
      await expect(link).toBeVisible();
      await expect(link.locator('[data-brand="logo"]')).toBeVisible();
      await expect(link.locator('[data-brand="symbol"]')).toBeHidden();

      const colors = await logoColors(page, 'aside [data-brand="logo"]');
      expect(colors.color, JSON.stringify(colors)).not.toEqual(colors.background);
      expect(colors.contrast, JSON.stringify(colors)).toBeGreaterThanOrEqual(3);
      // A barra é escura nos dois temas (#111111 claro, #1E1F22 escuro): a parte escura da logo aparece CLARA.
      expect(colors.background).toEqual(theme === "light" ? [17, 17, 17] : [30, 31, 34]);
      expect(Math.min(...colors.color)).toBeGreaterThan(200);
      expect((await accentColors(page, 'aside [data-brand="logo"]')).stroke).toBe("rgb(217, 84, 30)");
      expect(await duplicateIds(page)).toEqual([]);
      await context.close();
    });

    test("barra lateral RECOLHIDA (app): link 'MyWallet' só com o símbolo", async ({ browser, baseURL }) => {
      const context = await newContext(browser, baseURL!, theme, { signedIn: true, collapsed: true });
      const page = await context.newPage();
      await gotoHydrated(page, "/dashboard");
      const link = page.locator("aside").getByRole("link", { name: BRAND_NAME });
      await expect(link).toBeVisible();
      await expect(link.locator('[data-brand="symbol"]')).toBeVisible();
      await expect(link.locator('[data-brand="logo"]')).toBeHidden();
      expect(await page.locator("aside [data-brand]:visible").count()).toBe(1);

      const colors = await logoColors(page, 'aside [data-brand="symbol"]');
      expect(colors.color, JSON.stringify(colors)).not.toEqual(colors.background);
      expect(colors.contrast, JSON.stringify(colors)).toBeGreaterThanOrEqual(3);
      expect(await duplicateIds(page)).toEqual([]);
      await context.close();
    });
  });
}

test.describe("barra lateral expandida: logo de 32 px", () => {
  for (const theme of THEMES) {
    test(`altura de 32 px, cabe na barra sem quebrar nem cortar — tema ${theme}`, async ({ browser, baseURL }) => {
      const context = await newContext(browser, baseURL!, theme, { signedIn: true });
      const page = await context.newPage();
      await gotoHydrated(page, "/dashboard");
      const logo = page.locator('aside [data-brand="logo"]');
      await expect(logo).toBeVisible();
      const box = (await logo.boundingBox())!;
      const aside = (await page.locator("aside").boundingBox())!;
      const header = (await page.locator("aside .sidebar-header").boundingBox())!;
      expect(box.height).toBeCloseTo(32, 0);
      expect(box.width).toBeCloseTo(32 * (386 / 75), 0); // proporção original da logo
      // Dentro da barra, com folga dos dois lados (o cabeçalho tem 16 px de margem interna) e dentro da altura do cabeçalho.
      expect(box.x).toBeGreaterThanOrEqual(aside.x + 8);
      expect(box.x + box.width).toBeLessThanOrEqual(aside.x + aside.width - 8);
      expect(box.y).toBeGreaterThanOrEqual(header.y);
      expect(box.y + box.height).toBeLessThanOrEqual(header.y + header.height);
      // Sem quebra nem corte: o cabeçalho não tem conteúdo transbordando e o link tem a altura da logo.
      expect(await page.locator("aside .sidebar-header").evaluate((el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true);
      expect(await page.locator("aside .sidebar-header a").evaluate((el) => el.getBoundingClientRect().height)).toBeCloseTo(32, 0);
      await context.close();
    });
  }

  test("barra recolhida (símbolo de 32 px) e trilho do celular não mudaram", async ({ browser, baseURL }) => {
    const context = await newContext(browser, baseURL!, "light", { signedIn: true, collapsed: true });
    const page = await context.newPage();
    await gotoHydrated(page, "/dashboard");
    const symbol = (await page.locator('aside [data-brand="symbol"]').boundingBox())!;
    expect([Math.round(symbol.width), Math.round(symbol.height)]).toEqual([32, 32]);
    expect((await page.locator("aside").boundingBox())!.width).toBeLessThanOrEqual(73);
    await context.close();
  });
});

// Telas de autenticação: login, cadastro, esqueci a senha, redefinir senha (com link) e /reaceite (sem link).
const AUTH_SCREENS = [
  { path: "/login", link: true },
  { path: "/register", link: true },
  { path: "/forgot-password", link: true },
  { path: "/reset-password/brand-teste", link: true },
  { path: "/reaceite", link: false },
  { path: "/onboarding", link: false },
] as const;

async function openAuthScreen(browser: Browser, baseURL: string, screen: (typeof AUTH_SCREENS)[number], theme: Theme, viewport?: { width: number; height: number }) {
  const loggedUser = screen.path === "/reaceite" ? reacceptUser : screen.path === "/onboarding" ? onboardingUser : undefined;
  const context = await newContext(browser, baseURL, theme, loggedUser ? { signedIn: true, user: loggedUser, viewport } : { viewport });
  const page = await context.newPage();
  await gotoHydrated(page, screen.path);
  await expect(page).toHaveURL(new RegExp(`${screen.path}$`)); // sem redirecionamento: a tela pedida
  await expect(page.locator("main [data-brand=logo]")).toBeVisible();
  return { context, page };
}

for (const theme of THEMES) {
  test.describe(`logo nas telas de autenticação — tema ${theme}`, () => {
    for (const screen of AUTH_SCREENS) {
      test(`${screen.path}: logo com o nome 'MyWallet', ${screen.link ? "link para /" : "SEM link"}, 36 px, centralizada acima do cartão, h1 intacto`, async ({ browser, baseURL }) => {
        const { context, page } = await openAuthScreen(browser, baseURL!, screen, theme);
        const logo = page.locator("main [data-brand=logo]");
        await expect(logo).toHaveCount(1);
        await expect(logo).toHaveAttribute("aria-label", BRAND_NAME);

        if (screen.link) {
          const link = page.getByRole("link", { name: BRAND_NAME });
          await expect(link).toHaveCount(1);
          await expect(link).toHaveAttribute("href", "/");
          await expect(link.locator("[data-brand=logo]")).toBeVisible();
        } else {
          // /reaceite: a logo é só imagem com nome; nada a leva a "/" (sair dali só pelos botões da tela).
          await expect(page.getByRole("img", { name: BRAND_NAME })).toBeVisible();
          await expect(page.getByRole("link", { name: BRAND_NAME })).toHaveCount(0);
          await expect(page.locator("main a:has([data-brand])")).toHaveCount(0);
          await expect(page.locator('a[href="/"]')).toHaveCount(0); // nenhum link para "/" na tela
        }

        // A logo não é título: o h1 continua sendo o da tela, e nenhum título contém a logo.
        const h1 = page.getByRole("heading", { level: 1 });
        await expect(h1).toHaveCount(1);
        await expect(h1).not.toHaveText(BRAND_NAME);
        await expect(page.locator("h1 [data-brand], h2 [data-brand], h3 [data-brand]")).toHaveCount(0);

        // 36 px de altura, centralizada e a 24 px (mb-6) acima do cartão.
        const logoBox = (await logo.boundingBox())!;
        const cardBox = (await h1.locator("xpath=ancestor::div[contains(@class,'border')][1]").boundingBox())!;
        expect(logoBox.height).toBeCloseTo(36, 0);
        expect(logoBox.width).toBeCloseTo(36 * (386 / 75), 0);
        expect(Math.abs(logoBox.x + logoBox.width / 2 - (cardBox.x + cardBox.width / 2))).toBeLessThanOrEqual(1);
        expect(cardBox.y - (logoBox.y + logoBox.height)).toBeCloseTo(24, 0);

        // Cor: parte escura herda o texto principal (#111111 no claro, #D9DADC no escuro) e contrasta com o fundo.
        const colors = await logoColors(page, "main [data-brand=logo]");
        expect(colors.color, JSON.stringify(colors)).toEqual(theme === "light" ? [17, 17, 17] : [217, 218, 220]);
        expect(colors.contrast, JSON.stringify(colors)).toBeGreaterThanOrEqual(3);
        expect((await accentColors(page, "main [data-brand=logo]")).stroke).toBe("rgb(217, 84, 30)");
        expect(await duplicateIds(page)).toEqual([]);
        await context.close();
      });
    }
  });
}

test.describe("logo nas telas de autenticação no celular", () => {
  for (const width of [320, 390]) {
    test(`${width}px: as 5 telas mostram a logo completa de 36 px, sem rolagem horizontal`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      for (const screen of AUTH_SCREENS) {
        const { context, page } = await openAuthScreen(browser, baseURL!, screen, "light", { width, height: 800 });
        const logo = page.locator("main [data-brand=logo]");
        const box = (await logo.boundingBox())!;
        expect(box.height, screen.path).toBeCloseTo(36, 0); // cabe a 36 px: não precisou do tamanho menor
        expect(box.x, screen.path).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, screen.path).toBeLessThanOrEqual(width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${screen.path} sem rolagem horizontal`).toBe(true);
        expect(await duplicateIds(page), screen.path).toEqual([]);
        await context.close();
      }
    });
  }
});

test.describe("logo no celular (390px)", () => {
  const viewport = { width: 390, height: 844 };

  test("cabeçalho da landing: link 'MyWallet' com o símbolo (a logo completa fica escondida) e sem rolagem lateral", async ({ browser, baseURL }) => {
    const context = await newContext(browser, baseURL!, "light", { viewport });
    const page = await context.newPage();
    await gotoHydrated(page, "/");
    const link = page.locator("header").getByRole("link", { name: BRAND_NAME });
    await expect(link).toBeVisible();
    await expect(link.locator('[data-brand="symbol"]')).toBeVisible();
    await expect(link.locator('[data-brand="logo"]')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const colors = await logoColors(page, 'header [data-brand="symbol"]');
    expect(colors.color).not.toEqual(colors.background);
    expect(await duplicateIds(page)).toEqual([]);
    await context.close();
  });

  test("app: a barra vira o trilho de 72px, só com o símbolo, com o nome 'MyWallet' no link", async ({ browser, baseURL }) => {
    const context = await newContext(browser, baseURL!, "light", { signedIn: true, viewport });
    const page = await context.newPage();
    await gotoHydrated(page, "/dashboard");
    const link = page.locator("aside").getByRole("link", { name: BRAND_NAME });
    await expect(link).toBeVisible();
    await expect(link.locator('[data-brand="symbol"]')).toBeVisible();
    await expect(link.locator('[data-brand="logo"]')).toBeHidden();
    expect((await page.locator("aside").boundingBox())!.width).toBeLessThanOrEqual(73);
    expect(await duplicateIds(page)).toEqual([]);
    await context.close();
  });
});
