// UNICA lista das rotas de API que NAO exigem o reaceite dos documentos legais.
//
// Toda rota de API autenticada do app chama `legalReacceptBlock` (src/lib/legal/apiGate.ts) e
// responde 403 ao usuario com aceite pendente. As rotas abaixo ficam de fora de proposito, e o
// teste de varredura (tests/unit/legalReacceptRoutes.test.ts) le ESTA lista para saber quais:
//
//  - "auth/":  login, logout, cadastro, recuperacao e troca de senha, reautenticacao. Sem elas o
//              usuario com aceite pendente nao conseguiria sair, nem trocar a senha.
//  - "legal/": o aceite/reaceite dos documentos (a propria rota que libera o app).
//
// Caminhos relativos a src/app/api, com a barra final (prefixo de pasta).
//
// IMPORTANTE - DIREITOS DO TITULAR: as futuras rotas de EXPORTACAO DE DADOS e de EXCLUSAO DE CONTA
// (e qualquer outra que atenda um direito do titular: acesso, correcao, portabilidade, exclusao)
// DEVEM ser acrescentadas a esta lista. Direitos do titular nao podem depender de aceitar termos
// novos: quem recusa os Termos atualizados ainda precisa poder levar seus dados e encerrar a conta.
// Ao criar uma dessas rotas, inclua o prefixo aqui; sem isso o teste de varredura falha (a rota
// seria bloqueada pelo reaceite) - e o mesmo vale para uma futura server action desse tipo
// (ver REACCEPT_EXEMPT_ACTION_FILES abaixo).
//
// Fora da lista de proposito: a troca de tema (api/account/theme) e o perfil (api/account/profile).
// Sao preferencias de uso do app, nao direitos do titular; com o reaceite pendente o usuario so
// ve a tela /reaceite (que nao tem o botao de tema), entao nao ha o que liberar.
export const REACCEPT_EXEMPT_API_PREFIXES: readonly string[] = ["auth/", "legal/"];

export function isReacceptExemptApiPath(pathRelativeToApi: string): boolean {
  const normalized = pathRelativeToApi.split("\\").join("/").replace(/^\/+/, "");
  return REACCEPT_EXEMPT_API_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

// Server actions ("use server") isentas do guard (caminhos a partir da raiz do projeto). Hoje nao
// existe nenhuma server action no projeto, entao a lista e vazia; as mesmas regras valem: so
// entra aqui o que atende direito do titular ou autenticacao.
export const REACCEPT_EXEMPT_ACTION_FILES: readonly string[] = [];
