import { test, expect, type Page } from "@playwright/test";
import { gotoHydrated } from "./helpers/hydration";
import { fillMoney } from "./helpers/money";

// Os demais specs usam fillMoney (um unico evento `input`). Este exercita o
// caminho de DIGITACAO REAL no navegador: tecla a tecla, backspace, clique no
// meio do campo, colar da area de transferencia e o botao de sinal.

const PASSWORD = "SenhaValida123";

function uniqueEmail(prefix = "money") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
}

async function register(page: Page, name: string, email: string) {
  await gotoHydrated(page, "/register");
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmar senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
}

async function completeOnboarding(page: Page, name: string) {
  await page.getByRole("button", { name: "Loja", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Venda de produtos", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Nome da empresa").fill(name);
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

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

test.describe("MoneyInput - digitação real no navegador", () => {
  test("teclas, backspace, clique no meio, colar e salvar o valor emitido", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await register(page, "Dono Money", uniqueEmail());
    await completeOnboarding(page, "Empresa Money E2E");

    await gotoHydrated(page, "/financeiro/receitas");
    await page.getByRole("button", { name: "+ Novo lançamento" }).click();
    const dialog = page.getByRole("dialog");
    const valor = dialog.getByLabel("Valor");

    // Simbolo fixo fora da area editavel; campo vazio nao mostra NaN.
    await expect(dialog.getByText("R$", { exact: true })).toBeVisible();
    await expect(valor).toHaveValue("");
    await expect(valor).toHaveAttribute("placeholder", "0,00");
    await expect(valor).toHaveAttribute("inputmode", "numeric");

    // Sequencia do enunciado: 1,2,3,4,5,0 -> 0,01 ... 1.234,50
    await valor.click();
    const steps = ["0,01", "0,12", "1,23", "12,34", "123,45", "1.234,50"];
    for (const [i, digit] of [..."123450"].entries()) {
      await page.keyboard.press(digit);
      await expect(valor).toHaveValue(steps[i]);
    }

    // Backspace remove o ultimo digito do buffer.
    await page.keyboard.press("Backspace");
    await expect(valor).toHaveValue("123,45");
    await page.keyboard.press("0");
    await expect(valor).toHaveValue("1.234,50");

    // Letras e simbolos digitados sao ignorados.
    await page.keyboard.type("abc,.-");
    await expect(valor).toHaveValue("1.234,50");

    // Clicar no meio do texto e digitar NAO insere no meio: o cursor volta ao fim.
    const box = await valor.boundingBox();
    await page.mouse.click(box!.x + 12, box!.y + box!.height / 2);
    await page.keyboard.press("9");
    await expect(valor).toHaveValue("12.345,09");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");

    // Colar substitui o buffer e interpreta o numero ("R$ 1.500,75").
    await page.evaluate(() => navigator.clipboard.writeText("R$ 1.500,75"));
    await valor.click();
    await page.keyboard.press("Control+V");
    await expect(valor).toHaveValue("1.500,75");

    // Colar "1500" e o valor 1.500,00 (nao 15,00).
    await page.evaluate(() => navigator.clipboard.writeText("1500"));
    await page.keyboard.press("Control+V");
    await expect(valor).toHaveValue("1.500,00");

    // Preenche o resto e salva: o valor emitido ("1500.00") chega ao servidor.
    await dialog.getByLabel("Data").fill(todayIso());
    await dialog.getByLabel("Descrição").fill("Receita digitada no teclado E2E");
    await dialog.getByLabel("Categoria").selectOption({ label: "Venda de produtos" });
    await dialog.getByRole("button", { name: "Salvar" }).click();
    await expect(dialog).toHaveCount(0);

    const row = page.getByRole("row", { name: /Receita digitada no teclado E2E/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("R$1,500.00")).toBeVisible();

    // Reabrir para editar: o valor salvo ("1500") volta formatado no primeiro render.
    await row.getByRole("button", { name: "Editar" }).click();
    await expect(page.getByRole("dialog").getByLabel("Valor")).toHaveValue("1.500,00");
  });

  test("saldo inicial negativo pelo botão ±, salvo e reaberto com o sinal", async ({ page }) => {
    await register(page, "Dono Saldo", uniqueEmail("saldo"));
    await completeOnboarding(page, "Empresa Saldo Negativo E2E");

    await gotoHydrated(page, "/configuracoes");
    const saldo = page.getByLabel("Saldo inicial", { exact: true });
    const toggle = page.getByRole("button", { name: /alternar sinal/i });

    await saldo.click();
    for (const digit of "250000") await page.keyboard.press(digit);
    await expect(saldo).toHaveValue("2.500,00");

    await toggle.click();
    await expect(saldo).toHaveValue("-2.500,00");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    // Apagando tudo com o campo negativo, o sinal fica pendente ("-") e vale
    // no primeiro digito seguinte. (O clique no botao tirou o foco do campo.)
    await saldo.click();
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await expect(saldo).toHaveValue("-");
    for (const digit of "250000") await page.keyboard.press(digit);
    await expect(saldo).toHaveValue("-2.500,00");

    await page.getByLabel("Data do saldo inicial").fill("2026-01-01");
    await page.getByRole("button", { name: "Salvar saldo inicial" }).click();
    await expect(page.getByText("Saldo inicial atualizado com sucesso.")).toBeVisible();

    // Recarrega: o valor negativo persistido volta com o sinal.
    await page.reload();
    await expect(page.getByLabel("Saldo inicial", { exact: true })).toHaveValue("-2.500,00");
  });
});
