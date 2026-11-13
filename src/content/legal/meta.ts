// Controle dos documentos legais.
//
// LEGAL_DOCS_DRAFT: enquanto true, cada pagina legal mostra a faixa "Rascunho - em
// revisao". So pode virar false quando NENHUM marcador [PREENCHER: ...] /
// [VERIFICAR COM ADVOGADO: ...] restar nos textos (um teste garante isso:
// tests/unit/legalMarkers.test.ts).
export const LEGAL_DOCS_DRAFT = true;

// Versoes gravadas no cadastro (users.terms_version / users.privacy_version) junto com
// a data/hora do aceite. Mude a versao a cada alteracao relevante do texto.
// 0.2: servico pago (assinatura) - Termos com secao de assinatura e Politica com o provedor
// de cobranca. A pagina /tokushoho (Lei de Transacoes Comerciais Especificas) nasce na 0.1.
export const PRIVACY_POLICY_VERSION = "0.2";
export const TERMS_VERSION = "0.2";
export const COOKIES_VERSION = "0.1";
export const TOKUSHOHO_VERSION = "0.1";

// Data de vigencia (AAAA-MM-DD) - ainda nao definida: so o responsavel pode fixa-la.
export const LEGAL_EFFECTIVE_DATE = "[PREENCHER: data de vigência]";

// Nome do servico como aparece no app (landing e barra lateral).
export const SERVICE_NAME = "OrganizAI";

// Nome do cookie que registra que o aviso de cookies foi dispensado ("Entendi").
export const COOKIE_NOTICE_COOKIE = "cookie-notice";
export const COOKIE_NOTICE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 ano

export const LEGAL_PATHS = {
  privacy: "/privacidade",
  terms: "/termos",
  cookies: "/cookies",
  tokushoho: "/tokushoho",
} as const;

// Rotulo do link da pagina exigida no Japao (japones; exibir com lang="ja").
export const TOKUSHOHO_LINK_LABEL = "特定商取引法に基づく表記";
