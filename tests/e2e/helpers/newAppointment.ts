import { expect, type Locator, type Page } from "@playwright/test";
import { gotoHydrated } from "./hydration";
import { fillMoney } from "./money";

// Popup "Novo agendamento" (em passos) nos E2E: seletores e atalhos. Substitui a antiga pagina /agenda/novo.
//   1 Cliente -> 2 Servicos -> 3 Data -> [4 Pagamento, so com valor]; "Proximo" / "Voltar" / "Salvar"; contador "x/N".

export const popup = (page: Page): Locator => page.getByRole("dialog", { name: "Novo agendamento" });
export const clientDialog = (page: Page): Locator => page.getByRole("dialog", { name: "Novo cliente" });
export const discardDialog = (page: Page): Locator => page.getByRole("alertdialog", { name: "Descartar agendamento?" });
export const stepCounter = (page: Page): Locator => popup(page).getByTestId("step-counter").locator("span[aria-hidden='true']");
export const savedNotice = (page: Page): Locator => page.getByRole("status").filter({ hasText: "Agendamento salvo para" });

export async function waitForPopup(page: Page) {
  await expect(popup(page)).toBeVisible();
  // dados carregados: o primeiro campo do passo 1 aparece
  await expect(popup(page).getByLabel("Título (opcional)")).toBeVisible();
}

// Abre pelo botao do cabecalho da Agenda.
export async function openFromAgenda(page: Page) {
  await gotoHydrated(page, "/agenda");
  await page.getByRole("button", { name: "Novo agendamento", exact: true }).click();
  await waitForPopup(page);
}

// Abre pela rota antiga (redireciona para /agenda?novo=1&...).
export async function openByOldUrl(page: Page, search = "") {
  await gotoHydrated(page, `/agenda/novo${search}`);
  await waitForPopup(page);
}

export const next = (page: Page) => popup(page).getByRole("button", { name: "Próximo" }).click();
export const back = (page: Page) => popup(page).getByRole("button", { name: "Voltar" }).click();
export const save = (page: Page) => popup(page).getByRole("button", { name: "Salvar" }).click();

// Passo 1: cria um cliente pelo modal empilhado (o MESMO cadastro da pagina Clientes). Termina com o cliente escolhido.
export async function createClientInPopup(page: Page, name: string, extra: { whatsapp?: string } = {}) {
  await popup(page).getByRole("button", { name: /Criar novo cliente/ }).click(); // "+ Criar novo cliente" ou, com a lista vazia aberta, "Criar novo cliente"
  const dialog = clientDialog(page);
  await dialog.getByLabel("Nome", { exact: true }).fill(name);
  if (extra.whatsapp) await dialog.getByLabel("WhatsApp (opcional)").fill(extra.whatsapp);
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(popup(page).getByText(name)).toBeVisible();
}

// Passo 2: cria servicos novos (inline) com preco; cada um entra como linha.
export async function createServicesInPopup(page: Page, services: { name: string; price: string }[]) {
  const dialog = popup(page);
  for (const [index, service] of services.entries()) {
    await dialog.getByRole("button", { name: "Criar novo serviço" }).click();
    await dialog.getByLabel("Nome do serviço").fill(service.name);
    await fillMoney(dialog.getByLabel("Preço (opcional)"), service.price);
    await dialog.getByRole("button", { name: "Criar serviço" }).click();
    await expect(dialog.getByLabel("Valor unitário").nth(index)).toBeVisible();
  }
}

export type PopupAppointment = {
  title?: string;
  // Cria este cliente no passo 1 (ou escolhe um que ja exista, se `existingClient`).
  clientName?: string;
  whatsapp?: string;
  services?: { name: string; price: string }[];
  date?: string;
  notes?: string;
  payment?: { timing?: "AVISTA" | "APRAZO"; method?: string };
};

// Cria um agendamento percorrendo os passos do popup (aberto a partir do botao da Agenda). Termina com o popup fechado
// e a confirmacao na tela. Quem chama decide para onde ir depois.
export async function createAppointmentViaPopup(page: Page, appointment: PopupAppointment) {
  await openFromAgenda(page);
  const dialog = popup(page);
  if (appointment.title) await dialog.getByLabel("Título (opcional)").fill(appointment.title);
  if (appointment.clientName) await createClientInPopup(page, appointment.clientName, { whatsapp: appointment.whatsapp });
  await next(page);

  const hasValue = (appointment.services ?? []).some((s) => Number(s.price) > 0);
  if (appointment.services?.length) await createServicesInPopup(page, appointment.services);
  await next(page);

  if (appointment.date) await dialog.getByLabel("Data do atendimento").fill(appointment.date);
  if (appointment.notes) await dialog.getByLabel("Observação (opcional)").fill(appointment.notes);
  if (hasValue) {
    await next(page);
    if (appointment.payment?.timing === "APRAZO") await dialog.getByRole("button", { name: "A prazo" }).click();
    if (appointment.payment?.method) await dialog.getByLabel("Meio de pagamento (opcional)").selectOption({ label: appointment.payment.method });
  }
  await save(page);
  await expect(popup(page)).toHaveCount(0);
  await expect(savedNotice(page)).toBeVisible();
}
