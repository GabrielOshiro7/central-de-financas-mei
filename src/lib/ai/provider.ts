// Abstracao generica de provedor de IA (Etapa 7) - reaproveitavel pela
// Etapa 8 (Chat CFO), que vai precisar do mesmo contrato. Nenhum modulo de
// negocio (insights/narrative.ts incluso) chama um provedor concreto
// diretamente - sempre atraves de getAIProvider().
export interface AIProvider {
  generateText(prompt: string, opts?: { timeoutMs?: number }): Promise<string | null>;
}

// Provedor nulo: sempre retorna null. Todo o resto do sistema trata "null"
// de forma identica a "IA indisponivel" (nao configurado, timeout, erro,
// falha na checagem de whitelist) - existe exatamente um caminho de
// fallback, nunca um tratamento especial para "sem provedor".
export class NullProvider implements AIProvider {
  async generateText(): Promise<string | null> {
    return null;
  }
}

// Nao ha nenhuma chamada HTTP externa em nenhum outro lugar do codigo hoje
// (src/lib/email/devEmailService.ts e so um console.log) - entao nao existe
// convencao previa de timeout/retry a espelhar aqui. Decisao explicita da
// Etapa 7: nenhum provedor real e conectado nesta etapa (ver plano de
// implementacao) - getAIProvider() e o ponto de extensao unico para quando
// um provedor real (Anthropic, OpenAI etc.) for adicionado, sem que nenhum
// chamador precise mudar.
export function getAIProvider(): AIProvider {
  return new NullProvider();
}
