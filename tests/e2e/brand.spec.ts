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

test.beforeAll(async () => {
  appUser = await createOnboardedUser(prisma, "brand");
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: appUser.userId } });
  await prisma.$disconnect();
});

async function newContext(
  browser: Browser,
  baseURL: string,
  theme: Theme,
  opts: { signedIn?: boolean; collapsed?: boolean; viewport?: { width: number; height: number } } = {}
): Promise<BrowserContext> {
  const context = await browser.newContext(opts.viewport ? { viewport: opts.viewport } : {});
  await context.addCookies([
    { name: "theme", value: theme, url: baseURL },
    { name: "cookie-notice", value: "1", url: baseURL },
  ]);
  if (opts.signedIn) await appUser.signIn(context, baseURL);
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
