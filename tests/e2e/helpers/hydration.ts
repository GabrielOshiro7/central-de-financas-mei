import type { Page } from "@playwright/test";

// `page.goto` resolve no evento `load`, mas a hidratação do React chega
// depois - com `next dev -H 0.0.0.0` foram medidos 350-450ms de diferença.
// Preencher e clicar nesse intervalo faz o formulário ser enviado pelo
// navegador (GET na própria URL, ex. "/register?") em vez do handler do
// componente, e o teste para na mesma página. Por isso todo `goto` dos specs
// passa por aqui: espera o atributo que src/components/HydrationMarker.tsx
// só escreve depois de hidratar - um sinal real, não um timeout arbitrário.
export async function waitForHydration(page: Page) {
  await page.locator('html[data-hydrated="true"]').waitFor({ state: "attached" });
}

export async function gotoHydrated(page: Page, url: string) {
  const response = await page.goto(url);
  await waitForHydration(page);
  return response;
}
