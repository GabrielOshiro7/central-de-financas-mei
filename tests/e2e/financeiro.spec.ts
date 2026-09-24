import { test, expect, type Page } from "@playwright/test";
import { fillMoney } from "./helpers/money";

const PASSWORD = "SenhaValida123";

function uniqueEmail(prefix = "fin") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
}

// Receitas/Custos/Despesas filtram por "Este mês" por padrão - usar uma data
// do mês corrente evita que o lançamento criado no teste fique escondido
// pelo filtro padrão.
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function register(page: Page, name: string, email: string) {
  await page.goto("/register");
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

test.describe("financeiro - lançamentos manuais", () => {
  test("cria, edita e exclui um lançamento pela UI", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, "Dono Financeiro", email);
    await completeOnboarding(page, "Empresa Financeiro Manual");

    await page.getByRole("link", { name: "Financeiro" }).click();
    await expect(page).toHaveURL(/\/financeiro/);

    // Criar um lancamento de receita (modal escopado por role=dialog, ja que
    // "Categoria" tambem e o rotulo do filtro nas paginas de lista).
    await page.getByRole("button", { name: "+ Novo lançamento" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Data").fill(todayIso());
    await dialog.getByLabel("Descrição").fill("Venda balcão E2E");
    await dialog.getByLabel("Categoria").selectOption({ label: "Venda de produtos" });
    await fillMoney(dialog.getByLabel("Valor"), "500");
    await dialog.getByRole("button", { name: "Salvar" }).click();

    await page.getByRole("link", { name: "Receitas" }).click();
    await expect(page).toHaveURL(/\/financeiro\/receitas/);
    await expect(page.getByText("Venda balcão E2E")).toBeVisible();

    // Editar o lancamento.
    await page.getByRole("button", { name: "Editar" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Descrição").fill("Venda balcão E2E editada");
    await dialog.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Venda balcão E2E editada")).toBeVisible();

    // Excluir com confirmacao. Excluir lancamento e uma acao sensivel (Etapa
    // sessao-expiracao-reauth) - a sessao recem-logada ainda nao esta
    // elevada, entao o servidor recusa e a UI abre o modal de reauth antes
    // de completar a exclusao.
    await page.getByRole("button", { name: "Excluir" }).click();
    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog.getByText("Tem certeza que deseja excluir este lançamento?")).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Excluir" }).click();

    const reauthDialog = page.getByRole("alertdialog", { name: "Confirme sua senha" });
    await expect(reauthDialog).toBeVisible();
    await reauthDialog.getByLabel("Senha").fill(PASSWORD);
    await reauthDialog.getByRole("button", { name: "Confirmar" }).click();

    await expect(page.getByText("Venda balcão E2E editada")).toHaveCount(0);
    await expect(page.getByText("Nenhum lançamento encontrado")).toBeVisible();
  });

  // Cenario/teste 8: filtrar por periodo.
  test("filtra a lista de lançamentos por período", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, "Dono Filtro", email);
    await completeOnboarding(page, "Empresa Financeiro Filtro");

    await page.goto("/financeiro/despesas");

    async function addExpense(date: string, description: string) {
      await page.getByRole("button", { name: "+ Novo lançamento" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Despesa", exact: true }).click();
      await dialog.getByLabel("Data").fill(date);
      await dialog.getByLabel("Descrição").fill(description);
      await dialog.getByLabel("Categoria").selectOption({ label: "Aluguel" });
      await fillMoney(dialog.getByLabel("Valor"), "100");
      await dialog.getByRole("button", { name: "Salvar" }).click();
      // O modal fecha ao salvar - isso confirma sucesso mesmo quando a data
      // cai fora do filtro "Este mês" (a lista continua sem mostrar a linha
      // ate o filtro mudar, e e exatamente isso que o teste verifica adiante).
      await expect(dialog).toHaveCount(0);
    }

    await addExpense("2020-01-15", "Despesa antiga fora do período");
    await addExpense(todayIso(), "Despesa deste mês");

    // Por padrao (Este mes) so a despesa recente deve aparecer.
    await page.reload();
    await expect(page.getByText("Despesa deste mês")).toBeVisible();
    await expect(page.getByText("Despesa antiga fora do período")).toHaveCount(0);

    // Personalizado cobrindo 2020 deve mostrar so a despesa antiga.
    // "De" com exact:true evita casar por substring com o botao de dev tools
    // do Next.js ("Open Next.js Dev Tools" contem "De" dentro de "Dev").
    await page.getByLabel("Período").selectOption({ label: "Personalizado" });
    await page.getByLabel("De", { exact: true }).fill("2020-01-01");
    await page.getByLabel("Até", { exact: true }).fill("2020-12-31");
    await expect(page.getByText("Despesa antiga fora do período")).toBeVisible();
    await expect(page.getByText("Despesa deste mês")).toHaveCount(0);
  });
});

test.describe("financeiro - importação", () => {
  test("importa um CSV válido de ponta a ponta (upload, prévia, confirmação)", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, "Dono Importacao", email);
    await completeOnboarding(page, "Empresa Importacao E2E");

    await page.goto("/financeiro/importar");

    const today = todayIso();
    const csvContent =
      "data,tipo,categoria,descricao,valor,observacao\n" +
      `${today},receita,Venda de produtos,Venda importada E2E,1234,Observação teste\n` +
      `${today},despesa,Aluguel,Aluguel importado E2E,999,\n`;

    const fileInput = page.locator('input[type="file"][accept=".csv"]');
    await fileInput.setInputFiles({
      name: "lancamentos.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent, "utf-8"),
    });

    await expect(page.getByText("Encontramos 2 lançamentos.")).toBeVisible();
    await expect(page.getByText("2 registros válidos")).toBeVisible();

    await page.getByRole("button", { name: /Importar 2 lançamentos/ }).click();
    await expect(page.getByText(/2 lançamentos importados com sucesso/)).toBeVisible();

    await page.goto("/financeiro/receitas");
    await expect(page.getByText("Venda importada E2E")).toBeVisible();

    await page.goto("/financeiro/despesas");
    await expect(page.getByText("Aluguel importado E2E")).toBeVisible();
  });

  test("mostra erros de validação e não importa arquivo com problemas", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, "Dono Importacao Erro", email);
    await completeOnboarding(page, "Empresa Importacao Erro E2E");

    await page.goto("/financeiro/importar");

    // Categoria desconhecida NAO e mais um erro bloqueante (Etapa 3.1) - so
    // data invalida e valor invalido continuam bloqueando a linha aqui.
    const csvContent =
      "data,tipo,categoria,descricao,valor,observacao\n" +
      "2026-01-05,receita,Venda de produtos,Linha válida,100,\n" +
      "data-invalida,receita,Venda de produtos,Linha com data inválida,100,\n" +
      "2026-01-06,receita,Venda de produtos,Linha com valor inválido,abc,\n";

    const fileInput = page.locator('input[type="file"][accept=".csv"]');
    await fileInput.setInputFiles({
      name: "lancamentos-com-erro.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent, "utf-8"),
    });

    await expect(page.getByText("Encontramos 3 lançamentos.")).toBeVisible();
    await expect(page.getByText("1 registros válidos")).toBeVisible();
    await expect(page.getByText("2 registros com problemas")).toBeVisible();
    await expect(page.getByText("Data inválida.")).toBeVisible();
    await expect(page.getByText("Valor inválido.")).toBeVisible();
  });

  // Etapa 3.1, "Categorias adaptaveis": uma categoria desconhecida vira uma
  // secao "sera criada ao confirmar" na previa, em vez de bloquear a linha.
  test("categoria nova é detectada na prévia e criada ao confirmar", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, "Dono Categoria Nova", email);
    await completeOnboarding(page, "Empresa Categoria Nova E2E");

    await page.goto("/financeiro/importar");

    const today = todayIso();
    const novaCategoria = `Categoria Nova E2E ${Date.now()}`;
    const csvContent =
      "data,tipo,categoria,descricao,valor,observacao\n" +
      `${today},custo,${novaCategoria},Compra com categoria nova,50,\n`;

    const fileInput = page.locator('input[type="file"][accept=".csv"]');
    await fileInput.setInputFiles({
      name: "categoria-nova.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent, "utf-8"),
    });

    await expect(page.getByText("1 registros válidos")).toBeVisible();
    await expect(page.getByText("1 nova categoria será criada ao confirmar:")).toBeVisible();
    await expect(page.getByText(novaCategoria)).toBeVisible();

    await page.getByRole("button", { name: /Importar 1 lançamento/ }).click();
    await expect(page.getByText(/1 lançamento importado com sucesso/)).toBeVisible();
    await expect(page.getByText(/1 categoria\(s\) nova\(s\) criada\(s\)/)).toBeVisible();

    await page.goto("/financeiro/custos");
    const newRow = page.getByRole("row", { name: /Compra com categoria nova/ });
    await expect(newRow).toBeVisible();
    await expect(newRow.getByText(novaCategoria)).toBeVisible();
  });

  // Etapa 3.1, item 2: mapear a categoria nova para uma ja existente em vez
  // de criar uma nova (ex.: "Salario" -> "Salários").
  test("categoria nova pode ser mapeada para uma categoria já existente", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, "Dono Mapear Categoria", email);
    await completeOnboarding(page, "Empresa Mapear Categoria E2E");

    await page.goto("/financeiro/importar");

    const today = todayIso();
    const csvContent =
      "data,tipo,categoria,descricao,valor,observacao\n" +
      `${today},despesa,Salario,Pagamento equipe,2000,\n`;

    const fileInput = page.locator('input[type="file"][accept=".csv"]');
    await fileInput.setInputFiles({
      name: "mapear-categoria.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent, "utf-8"),
    });

    await expect(page.getByText("1 nova categoria será criada ao confirmar:")).toBeVisible();
    await page
      .getByLabel('O que fazer com a categoria nova "Salario"')
      .selectOption({ label: 'Mapear para "Salários"' });

    await page.getByRole("button", { name: /Importar 1 lançamento/ }).click();
    await expect(page.getByText(/1 lançamento importado com sucesso/)).toBeVisible();
    // 0 categorias novas criadas - foi mapeada para "Salários", que ja existe.
    await expect(page.getByText(/categoria\(s\) nova\(s\) criada\(s\)/)).toHaveCount(0);

    await page.goto("/financeiro/despesas");
    await expect(page.getByText("Pagamento equipe")).toBeVisible();
    const row = page.getByRole("row", { name: /Pagamento equipe/ });
    await expect(row.getByText("Salários", { exact: true })).toBeVisible();
  });
});
