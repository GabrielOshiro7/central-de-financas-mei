import { test, expect, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { gotoHydrated } from "./helpers/hydration";
import { openByOldUrl } from "./helpers/newAppointment";
import { createOnboardedUser, newTestPrisma } from "./helpers/session";
import { seedA11yData, type A11yFixture } from "./helpers/a11yFixture";
import { discoverWarmupTargets } from "./helpers/warmup";
import { assertTestDatabase, loadTestEnv } from "../testEnv";

// AUDITORIA DE ACESSIBILIDADE AUTOMATICA (WCAG 2.0/2.1/2.2, niveis A e AA) com axe-core.
//
// Varre TODAS as paginas (lista = a do aquecimento do servidor, gerada do sistema de arquivos, com
// ids reais nas paginas dinamicas), nos temas CLARO e ESCURO, mais os estados importantes: modais e
// dialogos abertos, lista suspensa de cliente, mensagens de erro de formulario, aviso de cookies e
// barra lateral recolhida. Gera o relatorio test-results/a11y/report.{json,md} agrupado por regra,
// severidade e pagina.
//
// Regra da suite: violacao CRITICAL ou SERIOUS faz o teste final FALHAR; MODERATE e MINOR so sao
// reportadas (ficam no relatorio).
loadTestEnv();
assertTestDatabase();
test.describe.configure({ mode: "serial" });

const prisma = newTestPrisma();
const createdUserIds: string[] = [];
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];
type Impact = "critical" | "serious" | "moderate" | "minor";

export type Finding = {
  rule: string;
  impact: Impact;
  theme: Theme;
  page: string;
  state: string;
  nodes: number;
  help: string;
  helpUrl: string;
  wcag: string[];
  samples: string[];
};
const findings: Finding[] = [];
let scans = 0;

let fixture: A11yFixture;
let appUser: Awaited<ReturnType<typeof createOnboardedUser>>;
let freshUser: Awaited<ReturnType<typeof createOnboardedUser>>;
let reacceptUser: Awaited<ReturnType<typeof createOnboardedUser>>;

async function newContext(browser: Browser, baseURL: string, theme: Theme, opts: { signedIn: boolean; user?: typeof appUser; noticeVisible?: boolean; collapsedSidebar?: boolean; viewport?: { width: number; height: number } }) {
  const context = await browser.newContext(opts.viewport ? { viewport: opts.viewport } : {});
  const cookies: { name: string; value: string; url: string }[] = [{ name: "theme", value: theme, url: baseURL }];
  if (!opts.noticeVisible) cookies.push({ name: "cookie-notice", value: "1", url: baseURL });
  await context.addCookies(cookies);
  if (opts.signedIn) await (opts.user ?? appUser).signIn(context, baseURL);
  if (opts.collapsedSidebar) await context.addInitScript(() => localStorage.setItem("sidebar-collapsed", "true"));
  return context;
}

async function scan(page: Page, theme: Theme, pageLabel: string, state = "página") {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  scans++;
  for (const v of results.violations) {
    findings.push({
      rule: v.id,
      impact: (v.impact ?? "minor") as Impact,
      theme,
      page: pageLabel,
      state,
      nodes: v.nodes.length,
      help: v.help,
      helpUrl: v.helpUrl,
      wcag: v.tags.filter((t) => /^wcag\d|^wcag2/.test(t) && /\d/.test(t)),
      samples: v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")} => ${(n.failureSummary ?? "").split("\n").slice(1, 3).join(" ").trim()}`.slice(0, 300)),
    });
  }
}

const settle = (page: Page) => page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  appUser = await createOnboardedUser(prisma, "a11y");
  createdUserIds.push(appUser.userId);
  const seedContext = await browser.newContext();
  await appUser.signIn(seedContext, baseURL!);
  fixture = await seedA11yData(seedContext.request);
  await seedContext.close();
  // Segundo usuario, SEM onboarding concluido, para a tela /onboarding.
  freshUser = await createOnboardedUser(prisma, "a11y-novo");
  createdUserIds.push(freshUser.userId);
  await prisma.business.update({ where: { userId: freshUser.userId }, data: { onboardingCompleted: false } });
  // Terceiro usuario, com o aceite dos documentos legais desatualizado, para a tela /reaceite.
  reacceptUser = await createOnboardedUser(prisma, "a11y-reaceite");
  createdUserIds.push(reacceptUser.userId);
  await prisma.user.update({ where: { id: reacceptUser.userId }, data: { termsVersion: "0.1", privacyVersion: "0.1" } });
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

function appUrl(url: string): string {
  return url
    .replace("/agenda/warmup/editar", `/agenda/${fixture.pendingAppointmentId}/editar`)
    .replace("/clientes/warmup", `/clientes/${fixture.clientId}`)
    .replace("/vendas/warmup/editar", `/vendas/${fixture.saleId}/editar`)
    .replace("/vendas/warmup", `/vendas/${fixture.saleId}`);
}

const pageTargets = () => discoverWarmupTargets().filter((t) => t.kind === "page");

for (const theme of THEMES) {
  test.describe(`páginas — tema ${theme}`, () => {
    test("telas públicas (sem login)", async ({ browser, baseURL }) => {
      test.setTimeout(240_000);
      const context = await newContext(browser, baseURL!, theme, { signedIn: false });
      const page = await context.newPage();
      for (const target of pageTargets().filter((t) => !t.authenticated && t.url !== "/onboarding")) {
        await gotoHydrated(page, target.url);
        await settle(page);
        if (target.url === "/") await page.waitForTimeout(3500); // animacao de entrada da landing (GSAP) termina
        await scan(page, theme, target.url);
      }
      await context.close();
    });

    test("onboarding (usuário sem onboarding concluído)", async ({ browser, baseURL }) => {
      const context = await newContext(browser, baseURL!, theme, { signedIn: true, user: freshUser });
      const page = await context.newPage();
      await gotoHydrated(page, "/onboarding");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await scan(page, theme, "/onboarding");
      await context.close();
    });

    test("reaceite dos documentos legais (aceite desatualizado)", async ({ browser, baseURL }) => {
      const context = await newContext(browser, baseURL!, theme, { signedIn: true, user: reacceptUser });
      const page = await context.newPage();
      await gotoHydrated(page, "/reaceite");
      await expect(page.getByRole("heading", { name: "Documentos atualizados", level: 1 })).toBeVisible();
      await scan(page, theme, "/reaceite", "aceite desatualizado");
      await context.close();
    });

    test("telas do app logado (com dados)", async ({ browser, baseURL }) => {
      test.setTimeout(480_000);
      const context = await newContext(browser, baseURL!, theme, { signedIn: true });
      const page = await context.newPage();
      for (const target of pageTargets().filter((t) => t.authenticated && t.url !== "/onboarding" && t.url !== "/reaceite")) {
        const url = appUrl(target.url);
        await gotoHydrated(page, url);
        await settle(page);
        await scan(page, theme, target.url);
      }
      await context.close();
    });
  });

  test.describe(`estados — tema ${theme}`, () => {
    test("modais e diálogos abertos (Nova receita, Novo cliente, Nova conta, Marcar como pago, Reverter, Desfazer)", async ({ browser, baseURL }) => {
      test.setTimeout(240_000);
      const context = await newContext(browser, baseURL!, theme, { signedIn: true });
      const page = await context.newPage();

      await gotoHydrated(page, "/financeiro/receitas");
      await page.getByRole("button", { name: "Nova receita" }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await scan(page, theme, "/financeiro/receitas", "modal Nova receita");

      await gotoHydrated(page, "/clientes");
      await page.getByRole("button", { name: "Novo cliente", exact: true }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await scan(page, theme, "/clientes", "modal Novo cliente");

      await gotoHydrated(page, "/financeiro/pagar");
      await page.getByRole("button", { name: "Nova conta a pagar", exact: true }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await scan(page, theme, "/financeiro/pagar", "modal Nova conta a pagar");

      await gotoHydrated(page, "/financeiro/pagar");
      await page.getByRole("button", { name: /Marcar como pago/ }).first().click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await scan(page, theme, "/financeiro/pagar", "diálogo Marcar como pago");

      await gotoHydrated(page, "/financeiro/pagar");
      await page.getByRole("button", { name: /Reverter/ }).first().click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await scan(page, theme, "/financeiro/pagar", "diálogo Reverter");

      await gotoHydrated(page, `/agenda?view=day&day=${fixture.today}`);
      await page.getByRole("button", { name: /Desfazer/ }).first().click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await scan(page, theme, "/agenda", "diálogo Desfazer conclusão");
      await context.close();
    });

    test("lista suspensa de cliente aberta", async ({ browser, baseURL }) => {
      const context = await newContext(browser, baseURL!, theme, { signedIn: true });
      const page = await context.newPage();
      await openByOldUrl(page);
      const input = page.getByLabel("Buscar cliente");
      await input.click();
      await input.fill("Cli");
      await expect(page.getByRole("listbox")).toBeVisible();
      await scan(page, theme, "/agenda?novo=1", "popup Novo agendamento: lista suspensa de cliente");
      await context.close();
    });

    test("mensagens de erro de formulário exibidas", async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const anon = await newContext(browser, baseURL!, theme, { signedIn: false });
      const page = await anon.newPage();
      await gotoHydrated(page, "/login");
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(page.getByRole("alert").first()).toBeVisible();
      await scan(page, theme, "/login", "erro de formulário");

      await gotoHydrated(page, "/register");
      await page.getByRole("button", { name: "Criar conta" }).click();
      await expect(page.getByRole("alert").first()).toBeVisible();
      await scan(page, theme, "/register", "erro de formulário");

      await gotoHydrated(page, "/forgot-password");
      await page.getByRole("button", { name: "Enviar link" }).click();
      await expect(page.getByRole("alert").first()).toBeVisible();
      await scan(page, theme, "/forgot-password", "erro de formulário");
      await anon.close();

      const logged = await newContext(browser, baseURL!, theme, { signedIn: true });
      const appPage = await logged.newPage();
      await gotoHydrated(appPage, "/clientes");
      await appPage.getByRole("button", { name: "Novo cliente", exact: true }).first().click();
      await appPage.getByRole("dialog").getByRole("button", { name: /Salvar|Criar|Cadastrar/ }).click();
      await expect(appPage.getByRole("dialog").getByRole("alert").first()).toBeVisible();
      await scan(appPage, theme, "/clientes", "erro de formulário no modal Novo cliente");
      await logged.close();
    });

    test("aviso de cookies visível (primeira visita)", async ({ browser, baseURL }) => {
      const anon = await newContext(browser, baseURL!, theme, { signedIn: false, noticeVisible: true });
      const page = await anon.newPage();
      await gotoHydrated(page, "/login");
      await expect(page.getByRole("region", { name: "Aviso de cookies" })).toBeVisible();
      await scan(page, theme, "/login", "aviso de cookies visível");
      await anon.close();
      const logged = await newContext(browser, baseURL!, theme, { signedIn: true, noticeVisible: true });
      const appPage = await logged.newPage();
      await gotoHydrated(appPage, "/dashboard");
      await expect(appPage.getByRole("region", { name: "Aviso de cookies" })).toBeVisible();
      await scan(appPage, theme, "/dashboard", "aviso de cookies visível");
      await logged.close();
    });

    test("barra lateral recolhida", async ({ browser, baseURL }) => {
      const context = await newContext(browser, baseURL!, theme, { signedIn: true, collapsedSidebar: true });
      const page = await context.newPage();
      for (const path of ["/dashboard", "/vendas", "/clientes"]) {
        await gotoHydrated(page, path);
        await settle(page);
        await scan(page, theme, path, "barra lateral recolhida");
      }
      await context.close();
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Relatorio e verificacao final.

const IMPACT_ORDER: Impact[] = ["critical", "serious", "moderate", "minor"];

function buildReport() {
  const byRule = new Map<string, Finding[]>();
  for (const f of findings) byRule.set(f.rule, [...(byRule.get(f.rule) ?? []), f]);
  const rules = [...byRule.entries()]
    .map(([rule, list]) => ({
      rule,
      impact: list.reduce<Impact>((worst, f) => (IMPACT_ORDER.indexOf(f.impact) < IMPACT_ORDER.indexOf(worst) ? f.impact : worst), "minor"),
      help: list[0].help,
      helpUrl: list[0].helpUrl,
      wcag: [...new Set(list.flatMap((f) => f.wcag))],
      nodes: list.reduce((sum, f) => sum + f.nodes, 0),
      pages: [...new Set(list.map((f) => `${f.page} [${f.state}] (${f.theme})`))],
      samples: list[0].samples,
    }))
    .sort((a, b) => IMPACT_ORDER.indexOf(a.impact) - IMPACT_ORDER.indexOf(b.impact) || b.nodes - a.nodes);
  const counts = Object.fromEntries(IMPACT_ORDER.map((i) => [i, rules.filter((r) => r.impact === i).length])) as Record<Impact, number>;
  return { scans, counts, rules };
}

test("relatório: sem violações critical/serious (moderate/minor só reportadas)", async () => {
  const report = buildReport();
  mkdirSync("test-results/a11y", { recursive: true });
  writeFileSync("test-results/a11y/report.json", JSON.stringify({ ...report, findings }, null, 2));
  const md = [
    `# Relatório axe (WCAG 2.x A/AA) — ${report.scans} varreduras`,
    `critical: ${report.counts.critical} | serious: ${report.counts.serious} | moderate: ${report.counts.moderate} | minor: ${report.counts.minor} (regras distintas)`,
    "",
    ...report.rules.flatMap((r) => [
      `## [${r.impact}] ${r.rule} — ${r.help} (${r.wcag.join(", ")}) — ${r.nodes} nós`,
      `${r.helpUrl}`,
      ...r.pages.slice(0, 12).map((p) => `- ${p}`),
      ...(r.pages.length > 12 ? [`- … e mais ${r.pages.length - 12}`] : []),
      ...r.samples.map((s) => `  - ${s}`),
      "",
    ]),
  ].join("\n");
  writeFileSync("test-results/a11y/report.md", md);
  console.log(`\n[a11y] ${report.scans} varreduras | critical=${report.counts.critical} serious=${report.counts.serious} moderate=${report.counts.moderate} minor=${report.counts.minor}`);
  for (const r of report.rules) console.log(`[a11y] ${r.impact.padEnd(8)} ${r.rule} x${r.nodes} nós em ${r.pages.length} páginas/estados — ${r.help}`);

  expect(report.scans, "sanidade: o axe rodou nas paginas e nos estados").toBeGreaterThan(60);
  const blocking = report.rules.filter((r) => r.impact === "critical" || r.impact === "serious");
  expect(
    blocking.map((r) => `${r.impact} ${r.rule} (${r.wcag.join(",")}) x${r.nodes}: ${r.pages.slice(0, 3).join("; ")}`),
    "violacoes critical/serious (relatorio completo em test-results/a11y/report.md)"
  ).toEqual([]);
});
