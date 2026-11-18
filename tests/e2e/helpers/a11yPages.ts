import { discoverWarmupTargets } from "./warmup";
import type { A11yFixture } from "./a11yFixture";

// Paginas da auditoria de acessibilidade: a lista do aquecimento (gerada do sistema de arquivos) com os
// segmentos dinamicos trocados por ids reais da fixture (as paginas de detalhe/edicao precisam de dado).
export type A11yPage = { url: string; path: string; authenticated: boolean };

export function a11yPages(fixture: A11yFixture): A11yPage[] {
  return discoverWarmupTargets()
    .filter((t) => t.kind === "page")
    .map((t) => ({
      path: t.url,
      authenticated: t.authenticated,
      url: t.url
        .replace("/agenda/warmup/editar", `/agenda/${fixture.pendingAppointmentId}/editar`)
        .replace("/clientes/warmup", `/clientes/${fixture.clientId}`)
        .replace("/vendas/warmup/editar", `/vendas/${fixture.saleId}/editar`)
        .replace("/vendas/warmup", `/vendas/${fixture.saleId}`),
    }));
}
