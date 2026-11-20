import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gotoHydrated } from "./helpers/hydration";
import { createOnboardedUser, newTestPrisma } from "./helpers/session";
import { assertTestDatabase, loadTestEnv } from "../testEnv";
import { INFORMATIONAL_NOTICE } from "@/content/legal/meta";

// Avisos de caráter informativo (Insights, Assistente, Dashboard) e a página pública /licencas.
loadTestEnv();
assertTestDatabase();
const prisma = newTestPrisma();

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe("aviso de caráter informativo", () => {
  for (const path of ["/insights", "/assistente", "/dashboard"]) {
    test(`${path}: texto único, no rodapé da página e discreto (sem cor de status)`, async ({ browser, baseURL }) => {
      const user = await createOnboardedUser(prisma, `aviso${path.replace("/", "-")}`);
      const context = await browser.newContext();
      await user.signIn(context, baseURL!);
      const page = await context.newPage();
      await gotoHydrated(page, path);

      const notice = page.locator("[data-informational-notice]");
      await expect(notice).toHaveCount(1);
      await expect(notice).toHaveText(INFORMATIONAL_NOTICE);
      await expect(notice).toBeVisible();

      // No rodapé: é o último elemento de conteúdo dentro da área principal.
      const isLast = await page.evaluate(() => {
        const el = document.querySelector("[data-informational-notice]")!;
        const container = el.parentElement!;
        return container.lastElementChild === el;
      });
      expect(isLast).toBe(true);

      // Discreto: texto pequeno e cinza (saturação baixa; o cinza do Tailwind tem leve tom azulado), nunca vermelho/âmbar/verde.
      const style = await notice.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { size: parseFloat(cs.fontSize), color: cs.color };
      });
      expect(style.size).toBeLessThanOrEqual(13);
      const [r, g, b] = style.color.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === min ? 0 : (max - min) / (max + min > 255 ? 510 - max - min : max + min);
      expect(saturation).toBeLessThanOrEqual(0.2);
      await context.close();
    });
  }
});

test.describe("página /licencas (avisos de terceiros)", () => {
  const file = JSON.parse(readFileSync(join(process.cwd(), "src", "content", "legal", "thirdPartyLicenses.json"), "utf8")) as {
    packages: { name: string; version: string; license: string }[];
  };

  test("é pública, lista cada pacote com versão e licença, e resume por tipo", async ({ page }) => {
    const res = await page.goto("/licencas");
    expect(res!.status()).toBe(200);
    await expect(page).toHaveTitle(/Avisos de terceiros/);
    await expect(page.getByRole("heading", { name: "Avisos de terceiros", level: 1 })).toBeVisible();

    const rows = page.getByTestId("licenses-table").locator("tbody tr");
    await expect(rows).toHaveCount(file.packages.length);
    const next = file.packages.find((p) => p.name === "next")!;
    await expect(rows.filter({ hasText: `next${next.version}` }).first()).toBeVisible();
    const gsap = file.packages.find((p) => p.name === "gsap")!;
    await expect(page.getByRole("row", { name: new RegExp(`^gsap ${gsap.version.replace(/\./g, "\\.")}`) })).toHaveCount(1);

    const summary = page.getByTestId("licenses-summary");
    await expect(summary).toContainText("Permissiva");
    await expect(summary).toContainText("Copyleft fraco");
    await expect(summary).toContainText("Copyleft forte");
    // Fontes e ícones.
    await expect(page.getByText(/SIL Open Font License 1\.1/).first()).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "lucide-react" })).toBeVisible();

    // GSAP: licença registrada com o nome e o link oficiais; jszip: escolha MIT.
    const special = page.getByTestId("licenses-special");
    await expect(special).toContainText("Standard No Charge GSAP License");
    await expect(special.getByRole("link", { name: "https://gsap.com/standard-license" })).toHaveAttribute("href", "https://gsap.com/standard-license");
    await expect(special).toContainText(`gsap ${gsap.version}`);
    await expect(special).toContainText("usa sob a licença MIT");
    const jszip = file.packages.find((p) => p.name === "jszip")!;
    await expect(page.getByRole("row", { name: new RegExp(`^jszip ${jszip.version.replace(/\./g, "\\.")} MIT \\(escolhida entre MIT OR GPL-3\\.0-or-later\\)`) })).toHaveCount(1);
  });

  test("o link 'Avisos de terceiros' aparece junto aos documentos legais (landing, login, páginas legais) e leva à página", async ({ page }) => {
    for (const start of ["/", "/login", "/privacidade", "/termos"]) {
      await gotoHydrated(page, start);
      const nav = page.getByRole("navigation", { name: "Documentos legais" });
      const link = nav.getByRole("link", { name: "Avisos de terceiros" });
      await expect(link, start).toBeVisible();
      await expect(link).toHaveAttribute("href", "/licencas");
    }
    await gotoHydrated(page, "/");
    await page.getByRole("navigation", { name: "Documentos legais" }).getByRole("link", { name: "Avisos de terceiros" }).click();
    await expect(page).toHaveURL(/\/licencas$/);
  });
});
