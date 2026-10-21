import { test, expect, type Locator, type Page } from "@playwright/test";
import { gotoHydrated } from "./helpers/hydration";
import { fillMoney } from "./helpers/money";

// Criação contextual no Financeiro: cada aba de tipo (Receitas/Custos/
// Despesas) tem o próprio botão, que abre o modal com o tipo fixo; Recorrentes
// tem "Novo lançamento recorrente" (seletor de tipo visível, recorrência
// travada). O "+ Novo lançamento" global da barra de abas não existe mais.

const PASSWORD = "SenhaValida123";

function uniqueEmail(prefix = "criacao") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
}

// Data LOCAL (não toISOString, que é UTC): o servidor agrupa "Este mês" e
// materializa recorrências no horário local, então usar o dia em UTC faria o
// teste falhar entre 00:00 e 09:00 de Tóquio.
function todayLocal(): { iso: string; day: number } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return { iso: `${y}-${m}-${d}`, day: now.getDate() };
}

async function registerAndOnboard(page: Page, name: string) {
  await gotoHydrated(page, "/register");
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("E-mail").fill(uniqueEmail());
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmar senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await page.getByRole("button", { name: "Loja", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Venda de produtos", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Nome da empresa").fill(`${name} Empresa`);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "1 a 3 anos", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Número de pessoas").fill("5");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /BRL/ }).click();
  await fillMoney(page.getByLabel("Valor médio mensal"), "10000");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Tudo pronto!" })).toBeVisible();
  await page.getByRole("button", { name: "Ir para o dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const TYPE_TABS = [
  { path: "/financeiro/receitas", label: "Nova receita", typeLabel: "Receita", category: "Venda de produtos" },
  { path: "/financeiro/custos", label: "Novo custo", typeLabel: "Custo", category: "Mercadoria" },
  { path: "/financeiro/despesas", label: "Nova despesa", typeLabel: "Despesa", category: "Aluguel" },
] as const;

const ALL_TABS = [
  "/financeiro/receitas",
  "/financeiro/custos",
  "/financeiro/despesas",
  "/financeiro/pagar",
  "/financeiro/receber",
  "/financeiro/recorrentes",
  "/financeiro/importar",
];

function tabBar(page: Page) {
  return page.getByRole("navigation", { name: "Seções do Financeiro" }).locator("..");
}

// O seletor de tipo do modal são três botões Receita/Custo/Despesa.
async function expectTypeSelector(dialog: Locator, visible: boolean) {
  for (const name of ["Receita", "Custo", "Despesa"]) {
    const button = dialog.getByRole("button", { name, exact: true });
    if (visible) await expect(button).toBeVisible();
    else await expect(button).toHaveCount(0);
  }
}

test.describe("Financeiro - criação contextual por aba", () => {
  for (const tab of TYPE_TABS) {
    test(`${tab.path}: "${tab.label}" abre o modal com o tipo fixo e o lançamento só aparece nessa aba`, async ({
      page,
    }) => {
      await registerAndOnboard(page, `Dono ${tab.typeLabel}`);
      const { iso } = todayLocal();
      const description = `${tab.typeLabel} contextual E2E ${Date.now()}`;

      await gotoHydrated(page, tab.path);
      const button = page.getByRole("button", { name: tab.label, exact: true });
      await expect(button).toBeVisible();
      await button.click();

      // Diálogo nomeado pelo título (aria-labelledby), sem seletor de tipo.
      const dialog = page.getByRole("dialog", { name: tab.label });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("heading", { name: tab.label })).toBeVisible();
      await expectTypeSelector(dialog, false);
      // Categorias do tipo da aba desde a abertura.
      await expect(dialog.getByLabel("Categoria").locator("option", { hasText: tab.category })).toHaveCount(1);

      await dialog.getByLabel("Data").fill(iso);
      await dialog.getByLabel("Descrição").fill(description);
      await dialog.getByLabel("Categoria").selectOption({ label: tab.category });
      await fillMoney(dialog.getByLabel("Valor"), "321");
      await dialog.getByRole("button", { name: "Salvar" }).click();
      await expect(dialog).toHaveCount(0);

      const row = page.getByRole("row", { name: new RegExp(description) });
      await expect(row).toBeVisible();
      await expect(row.getByText(tab.typeLabel, { exact: true })).toBeVisible();

      // Reabrir: mesmo título, tipo ainda fixo, formulário limpo.
      await button.click();
      const reopened = page.getByRole("dialog", { name: tab.label });
      await expect(reopened).toBeVisible();
      await expectTypeSelector(reopened, false);
      await expect(reopened.getByLabel("Descrição")).toHaveValue("");
      await expect(reopened.getByLabel("Categoria")).toHaveValue("");
      await reopened.getByRole("button", { name: "Cancelar" }).click();
      await expect(reopened).toHaveCount(0);

      // Não aparece nas outras duas abas de tipo.
      for (const other of TYPE_TABS.filter((t) => t.path !== tab.path)) {
        await gotoHydrated(page, other.path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByText(description)).toHaveCount(0);
      }
    });
  }

  test('a barra de abas não tem mais "Novo lançamento" em nenhuma aba', async ({ page }) => {
    await registerAndOnboard(page, "Dono Barra");
    for (const path of ALL_TABS) {
      await gotoHydrated(page, path);
      const bar = tabBar(page);
      await expect(bar).toBeVisible();
      await expect(bar).not.toContainText("Novo lançamento");
      await expect(bar.getByRole("button")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "+ Novo lançamento", exact: true })).toHaveCount(0);
    }
  });

  test('editar um lançamento mostra o seletor de tipo e o título "Editar lançamento"', async ({ page }) => {
    await registerAndOnboard(page, "Dono Edicao");
    const { iso } = todayLocal();
    const description = `Para editar E2E ${Date.now()}`;

    await gotoHydrated(page, "/financeiro/receitas");
    await page.getByRole("button", { name: "Nova receita", exact: true }).click();
    const createDialog = page.getByRole("dialog", { name: "Nova receita" });
    await createDialog.getByLabel("Data").fill(iso);
    await createDialog.getByLabel("Descrição").fill(description);
    await createDialog.getByLabel("Categoria").selectOption({ label: "Venda de produtos" });
    await fillMoney(createDialog.getByLabel("Valor"), "50");
    await createDialog.getByRole("button", { name: "Salvar" }).click();
    await expect(createDialog).toHaveCount(0);

    await page.getByRole("row", { name: new RegExp(description) }).getByRole("button", { name: "Editar" }).click();
    const editDialog = page.getByRole("dialog", { name: "Editar lançamento" });
    await expect(editDialog).toBeVisible();
    await expect(editDialog.getByText("Tipo", { exact: true })).toBeVisible();
    await expectTypeSelector(editDialog, true);
  });

  test('Recorrentes: "Novo lançamento recorrente" (vazio e com itens) cria a recorrência e o lançamento do dia na aba do tipo', async ({
    page,
  }) => {
    await registerAndOnboard(page, "Dono Recorrente");
    const { iso, day } = todayLocal();
    const description = `Recorrente contextual E2E ${Date.now()}`;

    // Estado vazio: o botão aparece uma vez, como CTA.
    await gotoHydrated(page, "/financeiro/recorrentes");
    await expect(page.getByText("Nenhum lançamento recorrente cadastrado.")).toBeVisible();
    const button = page.getByRole("button", { name: "Novo lançamento recorrente", exact: true });
    await expect(button).toHaveCount(1);
    await button.click();

    const dialog = page.getByRole("dialog", { name: "Novo lançamento recorrente" });
    await expect(dialog).toBeVisible();
    await expectTypeSelector(dialog, true);
    // Recorrência travada: sem checkbox, campos de recorrência já visíveis.
    await expect(dialog.getByRole("checkbox", { name: "Recorrente" })).toHaveCount(0);
    await expect(dialog.getByLabel("Frequência")).toBeVisible();
    await expect(dialog.getByLabel("Data de início")).toBeVisible();
    await expect(dialog.getByLabel("Data de fim (opcional)")).toBeVisible();

    // Mensal, começando hoje, no dia de hoje: o POST de recorrência
    // materializa na hora as ocorrências até agora - inclusive a de hoje.
    await dialog.getByRole("button", { name: "Despesa", exact: true }).click();
    await dialog.getByLabel("Data de início").fill(iso);
    await dialog.getByLabel("Descrição").fill(description);
    await dialog.getByLabel("Categoria").selectOption({ label: "Aluguel" });
    await fillMoney(dialog.getByLabel("Valor"), "1500");
    await dialog.getByLabel("Frequência").selectOption("MONTHLY");
    await dialog.getByLabel("Dia do mês").fill(String(day));
    await dialog.getByRole("button", { name: "Salvar" }).click();
    await expect(dialog).toHaveCount(0);

    // A lista atualiza com o item; com itens o botão continua presente uma
    // única vez (acima da tabela, não mais no estado vazio).
    const recurringRow = page.getByRole("row", { name: new RegExp(description) });
    await expect(recurringRow).toBeVisible();
    await expect(recurringRow.getByText("Despesa", { exact: true })).toBeVisible();
    await expect(page.getByText("Nenhum lançamento recorrente cadastrado.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Novo lançamento recorrente", exact: true })).toHaveCount(1);

    // Comportamento real da criação: a ocorrência de hoje vira lançamento
    // (origem "Recorrente") na aba do tipo escolhido, e só nela.
    await gotoHydrated(page, "/financeiro/despesas");
    const entryRow = page.getByRole("row", { name: new RegExp(description) });
    await expect(entryRow).toHaveCount(1);
    await expect(entryRow.getByText("Recorrente", { exact: true })).toBeVisible();
    for (const other of ["/financeiro/receitas", "/financeiro/custos"]) {
      await gotoHydrated(page, other);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText(description)).toHaveCount(0);
    }
  });

  test("375px: botões de criação visíveis e sem rolagem lateral", async ({ page }) => {
    await registerAndOnboard(page, "Dono Mobile");
    await page.setViewportSize({ width: 375, height: 812 });
    const cases = [
      ...TYPE_TABS.map((t) => ({ path: t.path, label: t.label })),
      { path: "/financeiro/recorrentes", label: "Novo lançamento recorrente" },
    ];
    for (const { path, label } of cases) {
      await gotoHydrated(page, path);
      const button = page.getByRole("button", { name: label, exact: true });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });
});
