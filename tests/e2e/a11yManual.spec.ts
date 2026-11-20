import { test, expect, type Browser, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { gotoHydrated } from "./helpers/hydration";
import { createOnboardedUser, newTestPrisma } from "./helpers/session";
import { seedA11yData, type A11yFixture } from "./helpers/a11yFixture";
import { a11yPages } from "./helpers/a11yPages";
import { hashPassword } from "@/lib/auth/password";
import { currentAcceptanceData } from "@/lib/legal/acceptance";
import { assertTestDatabase, loadTestEnv } from "../testEnv";

// ACESSIBILIDADE - CRITERIOS MANUAIS verificados por E2E (o que o axe nao cobre): idioma, titulo e
// estrutura; teclado (sem mouse, sem armadilha de foco, modais prendem e devolvem o foco); foco
// visivel e com contraste; reflow em 320 px e zoom 200%; nomes acessiveis; formularios; movimento.
// O que e so "recomendacao" (nao falha o teste) vai para test-results/a11y/manual.md.
loadTestEnv();
assertTestDatabase();

const prisma = newTestPrisma();
const createdUserIds: string[] = [];
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];
const PASSWORD = "SenhaValida123";
const soft: string[] = [];
const note = (line: string) => soft.push(line);

let fixture: A11yFixture;
let appUser: Awaited<ReturnType<typeof createOnboardedUser>>;
let freshUser: Awaited<ReturnType<typeof createOnboardedUser>>;
let loginEmail: string;

async function newContext(browser: Browser, baseURL: string, theme: Theme, opts: { signedIn: boolean; user?: typeof appUser; viewport?: { width: number; height: number }; reducedMotion?: "reduce" | "no-preference" } = { signedIn: false }) {
  const context = await browser.newContext({ ...(opts.viewport ? { viewport: opts.viewport } : {}), ...(opts.reducedMotion ? { reducedMotion: opts.reducedMotion } : {}) });
  await context.addCookies([
    { name: "theme", value: theme, url: baseURL },
    { name: "cookie-notice", value: "1", url: baseURL },
  ]);
  if (opts.signedIn) await (opts.user ?? appUser).signIn(context, baseURL);
  return context;
}

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  appUser = await createOnboardedUser(prisma, "a11ym");
  createdUserIds.push(appUser.userId);
  const seed = await browser.newContext();
  await appUser.signIn(seed, baseURL!);
  fixture = await seedA11yData(seed.request);
  await seed.close();
  freshUser = await createOnboardedUser(prisma, "a11ym-novo");
  createdUserIds.push(freshUser.userId);
  await prisma.business.update({ where: { userId: freshUser.userId }, data: { onboardingCompleted: false } });
  // Usuario com senha real, para o login so com teclado.
  loginEmail = `a11y-teclado-${Date.now()}@example.com`;
  const loginUser = await prisma.user.create({ data: { name: "Teclado A11y", email: loginEmail, passwordHash: await hashPassword(PASSWORD), ...currentAcceptanceData() } });
  createdUserIds.push(loginUser.id);
  await prisma.business.create({ data: { userId: loginUser.id, name: "Empresa Teclado", onboardingCompleted: true } });
});

test.afterAll(async () => {
  mkdirSync("test-results/a11y", { recursive: true });
  writeFileSync("test-results/a11y/manual.md", ["# Acessibilidade - verificacoes manuais (E2E)", "", ...soft.map((l) => `- ${l}`), ""].join("\n"));
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------------------------
// 1. Idioma, titulo e estrutura (WCAG 3.1.1, 3.1.2, 2.4.2, 1.3.1, 2.4.1, 2.4.6)

type Structure = {
  lang: string;
  title: string;
  h1: number;
  jumps: string[];
  main: number;
  nav: number;
  header: number;
  footer: number;
  japaneseOutsideLang: string[];
};

async function readStructure(page: Page): Promise<Structure> {
  return page.evaluate(() => {
    const visible = (el: Element) => (el as HTMLElement).getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible).map((h) => ({ level: Number(h.tagName[1]), text: (h.textContent ?? "").trim().slice(0, 30) }));
    const jumps: string[] = [];
    headings.forEach((h, i) => {
      if (i > 0 && h.level > headings[i - 1].level + 1) jumps.push(`h${headings[i - 1].level} -> h${h.level} "${h.text}"`);
    });
    const japanese = /[぀-ヿ㐀-䶿一-鿿]/;
    const outside: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      const el = node.parentElement;
      if (!el || !japanese.test(text) || el.closest("script,style,noscript")) continue;
      const lang = el.closest("[lang]")?.getAttribute("lang") ?? "";
      if (!lang.toLowerCase().startsWith("ja")) outside.push(text.trim().slice(0, 40));
    }
    return {
      lang: document.documentElement.lang,
      title: document.title,
      h1: headings.filter((h) => h.level === 1).length,
      jumps,
      main: document.querySelectorAll("main, [role='main']").length,
      nav: document.querySelectorAll("nav, [role='navigation']").length,
      header: document.querySelectorAll("body > header, [role='banner'], [data-app-shell] > header").length,
      footer: document.querySelectorAll("body footer, [role='contentinfo']").length,
      japaneseOutsideLang: outside,
    };
  });
}

test("idioma pt-BR, título único, um h1, hierarquia de títulos, regiões e trechos em japonês com lang=ja (todas as páginas)", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const pages = a11yPages(fixture);
  const anon = await newContext(browser, baseURL!, "light");
  const logged = await newContext(browser, baseURL!, "light", { signedIn: true });
  const onboarding = await newContext(browser, baseURL!, "light", { signedIn: true, user: freshUser });
  const titles = new Map<string, string[]>();
  const problems: string[] = [];
  for (const p of pages) {
    const context = p.path === "/onboarding" ? onboarding : p.authenticated ? logged : anon;
    const page = await context.newPage();
    await gotoHydrated(page, p.url);
    const s = await readStructure(page);
    // Pagina que so redireciona (ex.: /empresa -> /configuracoes) nao e uma pagina propria: conta pelo destino final.
    const finalPath = new URL(page.url()).pathname;
    if (finalPath === p.url.split("?")[0]) titles.set(s.title, [...(titles.get(s.title) ?? []), p.path]);
    if (s.lang !== "pt-BR") problems.push(`${p.path}: <html lang="${s.lang}"> (esperado pt-BR) [3.1.1]`);
    if (!s.title.trim()) problems.push(`${p.path}: sem título [2.4.2]`);
    if (s.h1 !== 1) problems.push(`${p.path}: ${s.h1} elementos h1 (esperado 1) [1.3.1/2.4.6]`);
    if (s.main !== 1) problems.push(`${p.path}: ${s.main} regiões main (esperado 1) [1.3.1/2.4.1]`);
    if (p.authenticated && p.path !== "/onboarding" && s.nav < 1) problems.push(`${p.path}: sem região de navegação [1.3.1]`);
    if (s.jumps.length) problems.push(`${p.path}: salto na hierarquia de títulos: ${s.jumps.join("; ")} [1.3.1]`);
    if (s.japaneseOutsideLang.length) problems.push(`${p.path}: japonês sem lang="ja": ${s.japaneseOutsideLang.slice(0, 3).join(" | ")} [3.1.2]`);
    if (!s.header || !s.footer) note(`estrutura ${p.path}: header=${s.header} nav=${s.nav} main=${s.main} footer=${s.footer}`);
    await page.close();
  }
  for (const [title, paths] of titles) if (paths.length > 1) problems.push(`título repetido "${title}" em: ${paths.join(", ")} [2.4.2]`);
  await Promise.all([anon.close(), logged.close(), onboarding.close()]);
  expect(problems, "problemas de idioma/título/estrutura").toEqual([]);
});

test("/tokushoho: título em japonês com lang=ja e conteúdo bilíngue marcado", async ({ browser, baseURL }) => {
  const context = await newContext(browser, baseURL!, "light");
  const page = await context.newPage();
  await gotoHydrated(page, "/tokushoho");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAttribute("lang", "ja");
  expect(await page.locator("td[lang='ja']").count()).toBeGreaterThanOrEqual(12);
  expect(await page.locator("td[lang='pt-BR']").count()).toBeGreaterThanOrEqual(12);
  await context.close();
});

// ---------------------------------------------------------------------------------------------
// 2. Teclado (WCAG 2.1.1, 2.1.2, 2.4.3, 3.2.1)

const insideDialog = (page: Page) =>
  page.evaluate(() => {
    const dialog = document.querySelector("[role='dialog'], [role='alertdialog']");
    return Boolean(dialog && dialog.contains(document.activeElement));
  });

async function trapAndReturn(page: Page, trigger: ReturnType<Page["getByRole"]>, label: string) {
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.locator("[role='dialog'], [role='alertdialog']").first();
  await expect(dialog, `${label}: abre pelo teclado`).toBeVisible();
  expect(await insideDialog(page), `${label}: o foco vai para dentro do diálogo ao abrir`).toBe(true);
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    expect(await insideDialog(page), `${label}: Tab #${i + 1} saiu do diálogo (armadilha de foco ausente)`).toBe(true);
  }
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await insideDialog(page), `${label}: Shift+Tab #${i + 1} saiu do diálogo`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog, `${label}: Esc fecha`).toHaveCount(0);
  await expect(trigger, `${label}: o foco volta ao botão que abriu`).toBeFocused();
}

test("teclado: diálogos prendem o foco, fecham com Esc e devolvem o foco ao botão", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const context = await newContext(browser, baseURL!, "light", { signedIn: true });
  const page = await context.newPage();

  await gotoHydrated(page, "/financeiro/receitas");
  await trapAndReturn(page, page.getByRole("button", { name: "Nova receita" }).first(), "modal Nova receita");

  await gotoHydrated(page, "/clientes");
  await trapAndReturn(page, page.getByRole("button", { name: "Novo cliente", exact: true }).first(), "modal Novo cliente");

  await gotoHydrated(page, "/financeiro/pagar");
  await trapAndReturn(page, page.getByRole("button", { name: "Nova conta a pagar", exact: true }).first(), "modal Nova conta a pagar");
  await trapAndReturn(page, page.getByRole("button", { name: /Marcar como pago/ }).first(), "diálogo Marcar como pago");
  await trapAndReturn(page, page.getByRole("button", { name: /Reverter/ }).first(), "diálogo Reverter");

  await gotoHydrated(page, `/agenda?view=day&day=${fixture.today}`);
  await trapAndReturn(page, page.getByRole("button", { name: /Desfazer/ }).first(), "diálogo Desfazer conclusão");
  await context.close();
});

test("teclado: login, menu lateral e lista de clientes só com Tab/Enter/setas", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const context = await newContext(browser, baseURL!, "light");
  const page = await context.newPage();
  await gotoHydrated(page, "/login");
  const tabUntil = async (predicate: () => Promise<boolean>, what: string, max = 60) => {
    for (let i = 0; i < max; i++) {
      if (await predicate()) return;
      await page.keyboard.press("Tab");
    }
    throw new Error(`teclado: não consegui chegar a ${what} com Tab em ${max} passos`);
  };
  await tabUntil(() => page.evaluate(() => document.activeElement?.id === "email"), "o campo de e-mail");
  await page.keyboard.type(loginEmail);
  await page.keyboard.press("Tab");
  await page.keyboard.type(PASSWORD);
  // O Enter do app avanca de campo (useEnterToNextField); quem usa so teclado chega ao botao com Tab.
  await tabUntil(() => page.evaluate(() => (document.activeElement as HTMLButtonElement | null)?.type === "submit"), "o botão Entrar");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/dashboard/);

  // Menu lateral: chega a "Clientes" só com Tab e abre com Enter.
  await page.locator("body").click({ position: { x: 1, y: 1 } }); // tira o foco de qualquer campo
  await tabUntil(() => page.evaluate(() => (document.activeElement as HTMLAnchorElement | null)?.getAttribute("href") === "/clientes"), "o item Clientes do menu");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/clientes/);
  await context.close();

  // Lista suspensa de cliente: setas + Enter.
  const logged = await newContext(browser, baseURL!, "light", { signedIn: true });
  const p2 = await logged.newPage();
  await gotoHydrated(p2, "/agenda/novo");
  const search = p2.getByLabel("Buscar cliente");
  await search.focus();
  await p2.keyboard.type("Cli");
  await expect(p2.getByRole("listbox")).toBeVisible();
  await expect(p2.getByRole("option").first()).toBeVisible(); // resultados da busca carregados
  await p2.keyboard.press("ArrowDown");
  await p2.keyboard.press("Enter");
  // Escolheu o primeiro resultado: o campo de busca deu lugar ao cliente selecionado (com o botao "Trocar").
  await expect(p2.getByRole("button", { name: "Trocar" })).toBeVisible();
  await expect(p2.getByLabel("Buscar cliente")).toHaveCount(0);
  await logged.close();
});

test("teclado: ordem de foco segue o DOM, sem tabindex positivo e sem armadilha nas páginas", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const context = await newContext(browser, baseURL!, "light", { signedIn: true });
  const page = await context.newPage();
  const problems: string[] = [];
  for (const path of ["/dashboard", "/clientes", "/financeiro/receitas", "/vendas/nova", "/configuracoes", "/agenda"]) {
    await gotoHydrated(page, path);
    const positive = await page.evaluate(() => [...document.querySelectorAll("[tabindex]")].filter((e) => Number(e.getAttribute("tabindex")) > 0).length);
    if (positive) problems.push(`${path}: ${positive} elemento(s) com tabindex positivo [2.4.3]`);
    let previous: string | null = null;
    let sameCount = 0;
    const visited = new Set<string>();
    let outOfOrder = 0;
    for (let i = 0; i < 160; i++) {
      await page.keyboard.press("Tab");
      const info: { key: string; before: boolean; segments: number } = await page.evaluate((prevKey: string | null) => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return { key: "BODY", before: false, segments: 1 };
        const all = [...document.querySelectorAll("*")];
        const key = `${el.tagName}#${all.indexOf(el)}`;
        let before = false;
        if (prevKey && prevKey !== "BODY") {
          const prevIndex = Number(prevKey.split("#")[1]);
          before = all.indexOf(el) < prevIndex; // foco foi para um elemento ANTERIOR no DOM
        }
        // <input type=date/time> tem varios segmentos (dia, mes, ano, botao): o Tab anda entre eles sem sair do elemento
        const type = (el as HTMLInputElement).type ?? "";
        const segments = /^(date|time|datetime-local|month|week)$/.test(type) ? 6 : 1;
        return { key, before, segments };
      }, previous);
      if (info.key === "BODY") break; // saiu da pagina para o navegador: sem armadilha
      if (info.before) outOfOrder++;
      sameCount = info.key === previous ? sameCount + 1 : 0;
      if (sameCount >= 2 + info.segments) {
        problems.push(`${path}: foco preso em ${info.key} [2.1.2]`);
        break;
      }
      previous = info.key;
      visited.add(info.key);
    }
    if (visited.size < 5) problems.push(`${path}: só ${visited.size} elementos focáveis alcançados por Tab`);
    if (outOfOrder > 0) note(`ordem de foco ${path}: ${outOfOrder} salto(s) para trás no DOM durante o Tab (revisar a ordem lógica, 2.4.3)`);
  }
  await context.close();
  expect(problems).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// 3. Foco sempre visivel, com contraste, nos dois temas (WCAG 2.4.7, 1.4.11)

async function focusedIndicator(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { skip: true as const };
    // <input type=date/time>: no ultimo Tab o foco vai ao botao nativo do calendario (parte interna do input; o
    // proprio input deixa de ser :focus-visible e o navegador desenha o anel nesse botao) - nao e do app.
    if (/^(date|time|datetime-local|month|week)$/.test((el as HTMLInputElement).type ?? "") && !el.matches(":focus-visible")) return { skip: true as const };
    const parse = (c: string) => {
      const m = /rgba?\(([^)]+)\)/.exec(c);
      if (!m) return null;
      const [r, g, b, a = "1"] = m[1].split(/[ ,/]+/).filter(Boolean);
      return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) };
    };
    const lum = (c: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    let bg = { r: 255, g: 255, b: 255 };
    // outline/box-shadow sao desenhados FORA do elemento (outline-offset): o fundo adjacente e o do ancestral.
    for (let n: HTMLElement | null = el.parentElement; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.95) {
        bg = c;
        break;
      }
    }
    let indicator: { r: number; g: number; b: number } | null = null;
    let kind = "nenhum";
    let uaDefault = false;
    const probe = (node: HTMLElement, via: string) => {
      const style = getComputedStyle(node);
      if (style.outlineStyle === "auto" && parseFloat(style.outlineWidth) > 0) {
        uaDefault = true;
        kind = "anel padrao do navegador (auto)" + via;
        return true;
      }
      if (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) {
        const c = parse(style.outlineColor);
        if (c) {
          indicator = c;
          kind = `outline ${style.outlineWidth} ${style.outlineStyle}${via}`;
          return true;
        }
      }
      if (style.boxShadow !== "none") {
        const colors = [...style.boxShadow.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0])).filter((c) => c && c.a > 0.01);
        if (colors[0]) {
          indicator = colors[0];
          kind = `box-shadow${via}`;
          return true;
        }
      }
      return false;
    };
    if (!probe(el, "")) {
      // o anel pode estar num ancestral que reage ao foco do filho (focus-within)
      for (let n = el.parentElement, depth = 0; n && depth < 3; n = n.parentElement, depth++) {
        if (n.matches(":focus-within") && probe(n, " (focus-within)")) break;
      }
    }
    const label = (el.getAttribute("aria-label") || el.textContent || (el as HTMLInputElement).placeholder || el.id || "").trim().slice(0, 40);
    return { skip: false as const, tag: el.tagName.toLowerCase(), label, kind, uaDefault, contrast: indicator ? Number(ratio(indicator, bg).toFixed(2)) : uaDefault ? 99 : 0 };
  });
}

for (const theme of THEMES) {
  test(`foco visível e com contraste ≥ 3:1 em páginas e modais — tema ${theme}`, async ({ browser, baseURL }) => {
    test.setTimeout(300_000);
    const missing: string[] = [];
    const weak: string[] = [];
    const checkPage = async (page: Page, where: string) => {
      await page.locator("body").click({ position: { x: 1, y: 1 } }).catch(() => {});
      for (let i = 0; i < 45; i++) {
        await page.keyboard.press("Tab");
        const info = await focusedIndicator(page);
        if (!info) break;
        if (info.skip) continue;
        const tag = `${where}: <${info.tag}> "${info.label}"`;
        if (info.kind === "nenhum") missing.push(tag);
        else if (info.contrast < 3) weak.push(`${tag} (${info.kind}, contraste ${info.contrast}:1)`);
      }
    };
    const anon = await newContext(browser, baseURL!, theme, { signedIn: false, reducedMotion: "reduce" });
    const publicPage = await anon.newPage();
    for (const path of ["/login", "/register", "/", "/termos"]) {
      await gotoHydrated(publicPage, path);
      await checkPage(publicPage, path);
    }
    await anon.close();
    const logged = await newContext(browser, baseURL!, theme, { signedIn: true, reducedMotion: "reduce" });
    const page = await logged.newPage();
    for (const path of ["/dashboard", "/clientes", "/financeiro/receitas", "/vendas", "/vendas/nova", "/configuracoes", "/agenda"]) {
      await gotoHydrated(page, path);
      await checkPage(page, path);
    }
    await gotoHydrated(page, "/financeiro/receitas");
    await page.getByRole("button", { name: "Nova receita" }).first().click();
    await checkPage(page, "modal Nova receita");
    await logged.close();
    for (const w of weak) note(`foco com contraste < 3:1 (${theme}) ${w}`);
    expect([...new Set(missing)], `elementos sem indicador de foco visível (${theme}) [2.4.7]`).toEqual([]);
    expect([...new Set(weak)], `indicador de foco com contraste < 3:1 (${theme}) [1.4.11]`).toEqual([]);
  });
}

// ---------------------------------------------------------------------------------------------
// 4. Reflow: 320 px (WCAG 1.4.10) e zoom de 200% (viewport 640 x 360 = 1280 x 720 a 200%)

test("reflow: sem rolagem horizontal da página em 320 px e em zoom 200%, em todas as páginas", async ({ browser, baseURL }) => {
  test.setTimeout(480_000);
  const pages = a11yPages(fixture).filter((p) => p.path !== "/onboarding");
  const problems: string[] = [];
  for (const viewport of [
    { width: 320, height: 640, label: "320 px" },
    { width: 640, height: 360, label: "zoom 200%" },
  ]) {
    const anon = await newContext(browser, baseURL!, "light", { signedIn: false, viewport });
    const logged = await newContext(browser, baseURL!, "light", { signedIn: true, viewport });
    for (const p of pages) {
      const page = await (p.authenticated ? logged : anon).newPage();
      await gotoHydrated(page, p.url);
      const overflow = await page.evaluate(() => {
        const cw = document.documentElement.clientWidth;
        const sw = document.documentElement.scrollWidth;
        if (sw <= cw + 1) return { overflow: 0, offenders: [] as string[] };
        const scrollable = (el: Element) => {
          for (let n: Element | null = el.parentElement; n && n !== document.body; n = n.parentElement) {
            const ox = getComputedStyle(n).overflowX;
            if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true;
          }
          return false;
        };
        const offenders = [...document.querySelectorAll("body *")]
          .filter((el) => el.getBoundingClientRect().right > cw + 1 && !scrollable(el))
          .slice(0, 3)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")}`);
        return { overflow: sw - cw, offenders };
      });
      if (overflow.overflow > 0) problems.push(`${p.path} (${viewport.label}): rolagem horizontal de ${overflow.overflow}px; ${overflow.offenders.join(" | ")} [1.4.10]`);
      await page.close();
    }
    await Promise.all([anon.close(), logged.close()]);
  }
  expect(problems, "páginas com rolagem horizontal").toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// 5. Nomes acessiveis (WCAG 2.4.4, 4.1.2, 2.5.3, 1.1.1)

const BARE_VERBS = ["Ver", "Editar", "Excluir", "Cancelar", "Reverter", "Pausar", "Retomar", "Reativar", "Inativar", "Desfazer", "Concluir", "Faltou", "Reabrir", "Confirmar", "Registrar recebimento", "Cancelar parcela"];

function namesOf(snapshot: string) {
  const named = [...snapshot.matchAll(/^\s*- (button|link) "((?:[^"\\]|\\.)*)"/gm)].map((m) => ({ role: m[1], name: m[2] }));
  const unnamed = [...snapshot.matchAll(/^\s*- (button|link)(?:\s*\[[^\]]*\])*:?\s*$/gm)].map((m) => m[1]);
  return { named, unnamed };
}

test("nomes acessíveis: ações de linha dizem DO QUE (sem 'Editar'/'Ver' repetidos), sem botões/links sem nome", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const context = await newContext(browser, baseURL!, "light", { signedIn: true });
  const page = await context.newPage();
  const problems: string[] = [];
  const listPages = ["/clientes", "/vendas", "/financeiro/receitas", "/financeiro/despesas", "/financeiro/custos", "/financeiro/pagar", "/financeiro/receber", "/financeiro/recorrentes", `/agenda?view=day&day=${fixture.today}`, `/vendas/${fixture.saleId}`, `/clientes/${fixture.clientId}`, "/dashboard", "/caixa"];
  for (const path of listPages) {
    await gotoHydrated(page, path);
    const { named, unnamed } = namesOf(await page.locator("body").ariaSnapshot());
    if (unnamed.length) problems.push(`${path}: ${unnamed.length} botão(ões)/link(s) sem nome acessível [4.1.2/2.4.4]`);
    const counts = new Map<string, number>();
    for (const n of named) counts.set(n.name, (counts.get(n.name) ?? 0) + 1);
    for (const verb of BARE_VERBS) {
      if ((counts.get(verb) ?? 0) > 1) problems.push(`${path}: "${verb}" aparece ${counts.get(verb)}x sem dizer do quê [2.4.4]`);
    }
    // 2.5.3 Label in Name: botoes de linha com aria-label contem o texto visivel (comecam com o verbo).
    const mismatched = await page.evaluate(() =>
      [...document.querySelectorAll("button[aria-label], a[aria-label]")]
        .map((el) => ({ label: el.getAttribute("aria-label")!.toLowerCase(), text: (el.textContent ?? "").trim().toLowerCase() }))
        .filter((x) => x.text && x.text.length <= 40 && !x.label.includes(x.text.replace(/[→.…]+/g, "").trim()))
        .map((x) => `"${x.text}" fora de "${x.label}"`)
        .slice(0, 3)
    );
    if (mismatched.length) problems.push(`${path}: aria-label não contém o texto visível: ${mismatched.join("; ")} [2.5.3]`);
  }
  await context.close();
  expect(problems).toEqual([]);
});

test("gráficos têm equivalente em texto (pontos com nome acessível) e selos de status têm texto", async ({ browser, baseURL }) => {
  const context = await newContext(browser, baseURL!, "light", { signedIn: true });
  const page = await context.newPage();
  for (const path of ["/dashboard", "/caixa"]) {
    await gotoHydrated(page, path);
    const chart = await page.evaluate(() => {
      const groups = [...document.querySelectorAll("[role='group'][aria-label^='Gráfico'], svg[role='img'][aria-label]")];
      const points = [...document.querySelectorAll("button[aria-label*='R$'], [role='button'][aria-label*='R$']")];
      const badges = [...document.querySelectorAll("span.rounded-full.px-2")].filter((e) => !(e.textContent ?? "").trim());
      return { groups: groups.length, points: points.length, emptyBadges: badges.length };
    });
    expect(chart.groups + chart.points, `${path}: gráfico sem equivalente em texto [1.1.1]`).toBeGreaterThan(0);
    expect(chart.emptyBadges, `${path}: selos sem texto (só cor) [1.4.1]`).toBe(0);
  }
  await context.close();
});

// ---------------------------------------------------------------------------------------------
// 6. Formularios (WCAG 1.3.1, 3.3.1, 3.3.2, 4.1.2, 4.1.3)

async function unlabeledControls(page: Page, scope = "body") {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel)!;
    const visible = (el: Element) => (el as HTMLElement).getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
    return [...root.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea")]
      .filter(visible)
      .filter((el) => {
        const c = el as HTMLInputElement;
        return !(c.labels && c.labels.length > 0) && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby");
      })
      .map((el) => `${el.tagName.toLowerCase()}#${el.id || "?"}[${el.getAttribute("type") ?? ""}] ${el.getAttribute("placeholder") ?? ""}`.trim());
  }, scope);
}

test("formulários: todo campo tem rótulo associado e a obrigatoriedade é programática (aria-required)", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const problems: string[] = [];
  const anon = await newContext(browser, baseURL!, "light");
  const a = await anon.newPage();
  for (const path of ["/login", "/register", "/forgot-password", "/reset-password/qualquer-token"]) {
    await gotoHydrated(a, path);
    const bad = await unlabeledControls(a, "main");
    if (bad.length) problems.push(`${path}: campos sem rótulo: ${bad.join("; ")} [1.3.1/4.1.2]`);
  }
  await gotoHydrated(a, "/login");
  await expect(a.getByLabel("E-mail")).toHaveAttribute("aria-required", "true");
  await expect(a.getByLabel("Senha", { exact: true })).toHaveAttribute("aria-required", "true");
  await anon.close();

  const logged = await newContext(browser, baseURL!, "light", { signedIn: true });
  const p = await logged.newPage();
  for (const path of ["/configuracoes", "/vendas/nova", "/agenda/novo", "/financeiro/importar", `/vendas/${fixture.saleId}/editar`, `/agenda/${fixture.pendingAppointmentId}/editar`, "/clientes", "/financeiro/receitas", "/vendas"]) {
    await gotoHydrated(p, path);
    const bad = await unlabeledControls(p, "main");
    if (bad.length) problems.push(`${path}: campos sem rótulo: ${bad.join("; ")} [1.3.1/4.1.2]`);
  }
  const modals: [string, string, string][] = [
    ["/clientes", "Novo cliente", "Cliente"],
    ["/financeiro/receitas", "Nova receita", "Receita"],
    ["/financeiro/pagar", "Nova conta a pagar", "Conta"],
  ];
  for (const [path, button, what] of modals) {
    await gotoHydrated(p, path);
    await p.getByRole("button", { name: button, exact: true }).first().click();
    const bad = await unlabeledControls(p, "[role='dialog']");
    if (bad.length) problems.push(`modal ${what}: campos sem rótulo: ${bad.join("; ")} [1.3.1/4.1.2]`);
    if (what === "Cliente") {
      await expect(p.getByRole("dialog").getByLabel("Nome", { exact: true })).toHaveAttribute("aria-required", "true");
      await expect(p.getByRole("dialog").getByLabel("Telefone (opcional)")).toHaveAttribute("aria-required", "false");
    }
    await p.keyboard.press("Escape");
  }
  await logged.close();
  expect(problems).toEqual([]);
});

test("formulários: erros são anunciados (role=alert) e o campo inválido é marcado", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const anon = await newContext(browser, baseURL!, "light");
  const page = await anon.newPage();
  const cases: [string, string][] = [
    ["/login", "Entrar"],
    ["/register", "Criar conta"],
    ["/forgot-password", "Enviar link"],
  ];
  for (const [path, button] of cases) {
    await gotoHydrated(page, path);
    await page.getByRole("button", { name: button, exact: true }).click();
    const alert = page.getByRole("alert").first();
    await expect(alert, `${path}: a mensagem de erro precisa ser anunciada (role=alert) [3.3.1/4.1.3]`).toBeVisible();
    expect(((await alert.textContent()) ?? "").trim().length, `${path}: erro em texto [3.3.1]`).toBeGreaterThan(5);
    const marked = await page.evaluate(() => ({
      invalid: document.querySelectorAll("[aria-invalid='true']").length,
      describedByError: [...document.querySelectorAll("input[aria-describedby]")].filter((i) => document.getElementById(i.getAttribute("aria-describedby")!)?.getAttribute("role") === "alert").length,
    }));
    if (!marked.invalid) note(`erro de formulário ${path}: nenhum campo recebe aria-invalid="true" nem aria-describedby para a mensagem (3.3.1 recomendado: ligar o erro ao campo)`);
  }
  await anon.close();
});

// ---------------------------------------------------------------------------------------------
// 7. Movimento reduzido (WCAG 2.2.2, 2.3.3)

test("prefers-reduced-motion: transições e animações são neutralizadas", async ({ browser, baseURL }) => {
  const reduced = await newContext(browser, baseURL!, "light", { signedIn: true, reducedMotion: "reduce" });
  const page = await reduced.newPage();
  await gotoHydrated(page, "/dashboard");
  const durations = await page.evaluate(() => {
    const sec = (v: string) => Math.max(...v.split(",").map((x) => parseFloat(x) * (x.trim().endsWith("ms") ? 0.001 : 1)));
    return [...document.querySelectorAll("main, aside, button, a")].slice(0, 40).map((el) => sec(getComputedStyle(el).transitionDuration));
  });
  expect(Math.max(...durations), "nenhuma transição deve durar mais que ~0 com movimento reduzido").toBeLessThan(0.01);
  await reduced.close();

  const normal = await newContext(browser, baseURL!, "light", { signedIn: true, reducedMotion: "no-preference" });
  const p2 = await normal.newPage();
  await gotoHydrated(p2, "/dashboard");
  const base = await p2.evaluate(() => Math.max(...[...document.querySelectorAll("main, aside, button, a")].slice(0, 40).map((el) => parseFloat(getComputedStyle(el).transitionDuration))));
  expect(base, "sem a preferência, as transições existem (controle)").toBeGreaterThan(0.05);
  await normal.close();
});

