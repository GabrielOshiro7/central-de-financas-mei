import { test, expect, type Page } from "@playwright/test";
import { gotoHydrated } from "./helpers/hydration";
import { fillMoney } from "./helpers/money";

const PASSWORD = "SenhaValida123";

function uniqueEmail(prefix = "agenda") {
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
    await gotoHydrated(page, "/agenda");
    await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
    // Aba padrao agora e "Calendario" (redesign) - hoje vem pre-selecionado
    // (secao 4), o painel do dia mostra o mesmo vazio que "Hoje" mostrava
    // antes.
    await expect(page.getByRole("link", { name: "Calendário" })).toHaveClass(/bg-gray-900/);
    await expect(page.getByText("Nenhum agendamento neste dia.")).toBeVisible();

    // exact: o painel do dia vazio tem tambem "+ Novo agendamento nesta data".
    await page.getByRole("link", { name: "+ Novo agendamento", exact: true }).click();
    await expect(page).toHaveURL(/\/agenda\/novo/);

    await page.getByRole("button", { name: "+ Criar novo cliente" }).click();
    await page.getByLabel("Nome do novo cliente").fill("Cliente Agenda E2E");
    await page.getByRole("button", { name: "Criar cliente" }).click();
    await expect(page.getByText("Cliente Agenda E2E")).toBeVisible();

    await page.getByRole("button", { name: "+ Criar novo serviço" }).click();
    await page.getByLabel("Nome do serviço").fill("Corte Agenda E2E");
    await page.getByLabel("Duração (min)").fill("30");
    await fillMoney(page.getByLabel("Preço (opcional)"), "80");
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
    await gotoHydrated(page, "/vendas");
    const salesRow = page.getByRole("row", { name: new RegExp(`Cliente Agenda E2E`) });
    await expect(salesRow).toBeVisible();
    await expect(salesRow.getByText(`#${saleNumber}`)).toBeVisible();
    await expect(salesRow.getByText("Confirmada", { exact: true })).toBeVisible();
    await expect(salesRow.getByText("Não paga", { exact: true })).toBeVisible();

    // Aparece em Contas a Receber, como pendente (Bill gerada pela
    // conclusão do atendimento, descrição "Venda #<numero>" - mesmo padrao
    // ja usado por generateSaleBills na Etapa 6).
    await gotoHydrated(page, "/financeiro/receber");
    await expect(page.getByRole("heading", { name: "Contas a receber" })).toBeVisible();
    const billRow = page.getByRole("row", { name: new RegExp(`Venda #${saleNumber}\\b`) }).first();
    await expect(billRow).toBeVisible();
    await expect(billRow.getByText("Pendente")).toBeVisible();

    expect(consoleErrors, `Erros de console encontrados: ${consoleErrors.join("; ")}`).toEqual([]);
  });

  // Mesmo calculo que formatTokyoMonthYear (src/lib/agenda/time.ts) faz no
  // servidor - usado aqui so pra montar um seletor estavel pro botao de
  // titulo do mes, sem depender de qual mes "hoje" realmente e quando o
  // teste roda.
  function currentTokyoMonthLabel(): string {
    const label = new Intl.DateTimeFormat("pt-BR", { timeZone: "Asia/Tokyo", month: "long", year: "numeric" }).format(new Date());
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  test("Calendário: navega entre meses, troca de ano pelo seletor, e clica num dia com ponto", async ({ page }) => {
    test.setTimeout(60_000);

    const email = uniqueEmail("agenda-cal");
    await register(page, "Dono Calendario E2E", email);
    await completeOnboarding(page, "Empresa Calendario E2E");

    // Cria um agendamento hoje (mesmo fluxo da criacao do teste principal),
    // so pra garantir que o dia de hoje tenha o "pontinho" no calendario.
    await gotoHydrated(page, "/agenda/novo");
    await page.getByRole("button", { name: "+ Criar novo cliente" }).click();
    await page.getByLabel("Nome do novo cliente").fill("Cliente Calendario E2E");
    await page.getByRole("button", { name: "Criar cliente" }).click();
    await expect(page.getByText("Cliente Calendario E2E")).toBeVisible();
    await page.getByRole("button", { name: "+ Criar novo serviço" }).click();
    await page.getByLabel("Nome do serviço").fill("Corte Calendario E2E");
    await page.getByLabel("Duração (min)").fill("30");
    await fillMoney(page.getByLabel("Preço (opcional)"), "80");
    await page.getByRole("button", { name: "Criar serviço" }).click();
    await expect(page.getByText("Corte Calendario E2E (30 min)")).toBeVisible();
    await page.locator("#startAt").fill(pastDateTimeInputValue());
    await page.getByRole("button", { name: "Agendar" }).click();
    await expect(page).toHaveURL(/\/agenda(\?|$)/);

    // exact: cada dia da grade e um botao cujo nome contem o mes/ano
    // ("1 de outubro de 2026, sem compromissos").
    const monthTitle = page.getByRole("button", { name: currentTokyoMonthLabel(), exact: true });
    await expect(monthTitle).toBeVisible();

    // Navega mes anterior e depois mes seguinte com as setas - volta pro mes
    // original.
    await page.getByRole("button", { name: "Mês anterior" }).click();
    await expect(monthTitle).not.toBeVisible();
    await page.getByRole("button", { name: "Próximo mês" }).click();
    await expect(monthTitle).toBeVisible();

    // Troca de ano pelo seletor de mes/ano.
    await monthTitle.click();
    const yearText = page.getByText(new RegExp(`^\\d{4}$`)).first();
    const initialYear = Number(await yearText.textContent());
    await page.getByRole("button", { name: "Próximo ano" }).click();
    // exact: o titulo ("Outubro de 2026") e o cabecalho do dia tambem contem o ano.
    await expect(page.getByText(String(initialYear + 1), { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Ano anterior" }).click();
    await expect(page.getByText(String(initialYear), { exact: true })).toBeVisible();
    // Escolhe o mes de Janeiro - navega e fecha o seletor.
    await page.getByRole("button", { name: "Jan", exact: true }).click();
    await expect(page.getByRole("button", { name: "Jan", exact: true })).not.toBeVisible();

    // Volta pro mes/dia de hoje.
    await page.getByRole("button", { name: "Hoje" }).click();
    await expect(monthTitle).toBeVisible();

    // O dia de hoje tem o "pontinho" (aria-current="date") - clica em outro
    // dia primeiro (painel some o agendamento), depois volta pra hoje (painel
    // mostra o agendamento de novo).
    const todayCell = page.locator('button[aria-current="date"]');
    await expect(todayCell).toBeVisible();
    await expect(page.getByText("Cliente Calendario E2E")).toBeVisible();

    const otherDay = page.locator("button[data-date-key]:not([aria-current='date'])").first();
    await otherDay.click();
    await expect(page.getByText("Nenhum agendamento neste dia.")).toBeVisible();

    await todayCell.click();
    await expect(page.getByText("Cliente Calendario E2E")).toBeVisible();
  });

  test("aba Mês mostra as contagens por status", async ({ page }) => {
    test.setTimeout(60_000);

    const email = uniqueEmail("agenda-month");
    await register(page, "Dono Mes E2E", email);
    await completeOnboarding(page, "Empresa Mes E2E");

    await gotoHydrated(page, "/agenda/novo");
    await page.getByRole("button", { name: "+ Criar novo cliente" }).click();
    await page.getByLabel("Nome do novo cliente").fill("Cliente Mes E2E");
    await page.getByRole("button", { name: "Criar cliente" }).click();
    await expect(page.getByText("Cliente Mes E2E")).toBeVisible();
    await page.getByRole("button", { name: "+ Criar novo serviço" }).click();
    await page.getByLabel("Nome do serviço").fill("Corte Mes E2E");
    await page.getByLabel("Duração (min)").fill("30");
    await fillMoney(page.getByLabel("Preço (opcional)"), "80");
    await page.getByRole("button", { name: "Criar serviço" }).click();
    await expect(page.getByText("Corte Mes E2E (30 min)")).toBeVisible();
    await page.locator("#startAt").fill(pastDateTimeInputValue());
    await page.getByRole("button", { name: "Agendar" }).click();
    await expect(page).toHaveURL(/\/agenda(\?|$)/);

    await page.getByRole("link", { name: "Mês" }).click();
    await expect(page).toHaveURL(/view=month/);
    await expect(page.getByText("Total")).toBeVisible();
    await expect(page.getByText("Agendados")).toBeVisible();
    await expect(page.getByText("Cliente Mes E2E")).toBeVisible();
  });
});
