import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "SenhaValida123";

function uniqueEmail(prefix = "agenda") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
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
  await page.getByLabel("Valor médio mensal").fill("10000");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Tudo pronto!" })).toBeVisible();
  await page.getByRole("button", { name: "Ir para o dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

// "YYYY-MM-DDTHH:mm" de um instante no passado (30 min atrás) - suficiente
// pra nao depender de fuso especifico neste teste (so precisa ser um
// horario aceitavel pro formulario, a logica de fuso de Toquio em si ja e
// coberta pelos testes unitarios/integracao de src/lib/agenda).
function pastDateTimeInputValue(): string {
  const d = new Date(Date.now() - 30 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

test.describe("Etapa 8 - agenda", () => {
  test("fluxo feliz: criar agendamento, concluir e ver a venda em Vendas e Contas a Receber", async ({ page }) => {
    // Timeout maior que o default (30s): este teste é o único que passa por
    // /agenda, /agenda/novo e as 4 rotas de API novas da Etapa 8 - todas
    // compiladas pela primeira vez nesta execução do servidor (Turbopack
    // dev), o que já foi observado levando ~10s+ numa única rota isolada.
    // Os outros specs de e2e do projeto não precisam disso porque não
    // acumulam tantas rotas nunca compiladas dentro de um único teste.
    test.setTimeout(60_000);

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const email = uniqueEmail();
    await register(page, "Dono Agenda E2E", email);
    await completeOnboarding(page, "Empresa Agenda E2E");

    // Criar agendamento - cliente e servico criados na hora, reaproveitando
    // as mesmas mutations de Client/Product (POST /api/clientes,
    // POST /api/produtos).
    await page.goto("/agenda");
    await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
    await expect(page.getByText("Nenhum agendamento para hoje.")).toBeVisible();

    await page.getByRole("link", { name: "+ Novo agendamento" }).click();
    await expect(page).toHaveURL(/\/agenda\/novo/);

    await page.getByRole("button", { name: "+ Criar novo cliente" }).click();
    await page.getByLabel("Nome do novo cliente").fill("Cliente Agenda E2E");
    await page.getByRole("button", { name: "Criar cliente" }).click();
    await expect(page.getByText("Cliente Agenda E2E")).toBeVisible();

    await page.getByRole("button", { name: "+ Criar novo serviço" }).click();
    await page.getByLabel("Nome do serviço").fill("Corte Agenda E2E");
    await page.getByLabel("Duração (min)").fill("30");
    await page.getByLabel("Preço (opcional)").fill("80");
    await page.getByRole("button", { name: "Criar serviço" }).click();
    await expect(page.getByText("Corte Agenda E2E (30 min)")).toBeVisible();

    await page.locator("#startAt").fill(pastDateTimeInputValue());
    await page.getByRole("button", { name: "Agendar" }).click();

    await expect(page).toHaveURL(/\/agenda(\?|$)/);
    await expect(page.getByText("Cliente Agenda E2E")).toBeVisible();
    await expect(page.getByText("Agendado", { exact: true })).toBeVisible();

    // Confirmar
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText("Confirmado", { exact: true })).toBeVisible();

    // Concluir - a prazo (2 parcelas), pra depois aparecer como pendente em
    // Contas a Receber.
    await page.getByRole("button", { name: "Concluir" }).click();
    await expect(page.getByRole("heading", { name: "Concluir atendimento" })).toBeVisible();
    await page.locator("#completeCategoryId").selectOption({ label: "Venda de serviços" });
    await page.getByRole("button", { name: "A prazo" }).click();

    await page.getByRole("button", { name: "Concluir atendimento" }).click();

    const saleLink = page.getByRole("link", { name: /ver venda #\d+/i });
    await expect(saleLink).toBeVisible();
    await expect(page.getByText("Concluído", { exact: true })).toBeVisible();

    const saleLinkText = await saleLink.textContent();
    const saleNumberMatch = /#(\d+)/.exec(saleLinkText ?? "");
    expect(saleNumberMatch).not.toBeNull();
    const saleNumber = saleNumberMatch![1];

    // Aparece em Vendas.
    await page.goto("/vendas");
    const salesRow = page.getByRole("row", { name: new RegExp(`Cliente Agenda E2E`) });
    await expect(salesRow).toBeVisible();
    await expect(salesRow.getByText(`#${saleNumber}`)).toBeVisible();
    await expect(salesRow.getByText("Confirmada", { exact: true })).toBeVisible();
    await expect(salesRow.getByText("Não paga", { exact: true })).toBeVisible();

    // Aparece em Contas a Receber, como pendente (Bill gerada pela
    // conclusão do atendimento, descrição "Venda #<numero>" - mesmo padrao
    // ja usado por generateSaleBills na Etapa 6).
    await page.goto("/financeiro/receber");
    await expect(page.getByRole("heading", { name: "Contas a receber" })).toBeVisible();
    const billRow = page.getByRole("row", { name: new RegExp(`Venda #${saleNumber}\\b`) }).first();
    await expect(billRow).toBeVisible();
    await expect(billRow.getByText("Pendente")).toBeVisible();

    expect(consoleErrors, `Erros de console encontrados: ${consoleErrors.join("; ")}`).toEqual([]);
  });
});
