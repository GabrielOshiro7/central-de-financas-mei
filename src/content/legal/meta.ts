// Controle dos documentos legais.
//
// LEGAL_DOCS_DRAFT: enquanto true, cada pagina legal mostra a faixa "Rascunho - em
// revisao". So pode virar false quando NENHUM marcador [PREENCHER: ...] /
// [VERIFICAR COM ADVOGADO: ...] restar nos textos (um teste garante isso:
// tests/unit/legalMarkers.test.ts).
import { BRAND_NAME } from "@/lib/brand";

export const LEGAL_DOCS_DRAFT = true;

// Versoes gravadas no cadastro (users.terms_version / users.privacy_version) junto com
// a data/hora do aceite. Mude a versao a cada alteracao relevante do texto.
// 0.2: servico pago (assinatura) - Termos com secao de assinatura e Politica com o provedor
// de cobranca. A pagina /tokushoho (Lei de Transacoes Comerciais Especificas) nasce na 0.1.
// 0.3 (so a Politica): declaracao de maioridade no cadastro e aceite tambem gravado no reaceite.
// Cada versao nova precisa de um resumo em src/content/legal/changes.ts (um teste cobra).
// 0.4 (so a Politica): texto fiel ao codigo sobre quando sessoes e links de recuperacao vencidos sao
// apagados (limpeza oportunista apos login e pedido de recuperacao, 24 h apos o vencimento) e o novo
// aceite dos documentos tambem traz a declaracao de maioridade.
export const PRIVACY_POLICY_VERSION = "0.4";
export const TERMS_VERSION = "0.2";
export const COOKIES_VERSION = "0.1";
export const TOKUSHOHO_VERSION = "0.1";

// Data de vigencia (AAAA-MM-DD) - ainda nao definida: so o responsavel pode fixa-la.
export const LEGAL_EFFECTIVE_DATE = "[PREENCHER: data de vigência]";

// Idade declarada na caixa de aceite do cadastro. O valor DEFINITIVO da idade minima dos Termos e
// da Politica ainda e [PREENCHER] (decisao do responsavel); quando for decidido, e so mudar esta
// constante: o texto da caixa le o mesmo valor (e um teste cobra que o texto use a constante).
export const MINIMUM_AGE = 18;

// Texto da caixa de aceite do cadastro, em duas partes: a frase antes dos links e os nomes dos
// documentos (que viram links). Ex.: "Declaro ter 18 anos ou mais e li e aceito os Termos de
// Serviço e a Política de Privacidade".
export const REGISTER_ACCEPT_LEAD = `Declaro ter ${MINIMUM_AGE} anos ou mais e li e aceito os`;
export const REGISTER_ACCEPT_TERMS_LABEL = "Termos de Serviço";
export const REGISTER_ACCEPT_PRIVACY_LABEL = "Política de Privacidade";
export const REGISTER_ACCEPT_TEXT = `${REGISTER_ACCEPT_LEAD} ${REGISTER_ACCEPT_TERMS_LABEL} e a ${REGISTER_ACCEPT_PRIVACY_LABEL}`;

// Aviso de caráter informativo (Insights, Assistente e Dashboard): mesmo texto nas tres telas.
export const INFORMATIONAL_NOTICE =
  "As informações e análises são geradas automaticamente a partir dos seus lançamentos, têm caráter informativo e não substituem orientação contábil, fiscal ou financeira profissional.";

// Nome do servico como aparece nas paginas legais: e o nome da marca (src/lib/brand.ts).
export const SERVICE_NAME = BRAND_NAME;

// Nome do cookie que registra que o aviso de cookies foi dispensado ("Entendi").
export const COOKIE_NOTICE_COOKIE = "cookie-notice";
export const COOKIE_NOTICE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 ano

export const LEGAL_PATHS = {
  privacy: "/privacidade",
  terms: "/termos",
  cookies: "/cookies",
  tokushoho: "/tokushoho",
  // Avisos de terceiros (licencas das dependencias). Nao e documento juridico do servico.
  licenses: "/licencas",
} as const;

// Rotulo do link da pagina exigida no Japao (japones; exibir com lang="ja").
export const TOKUSHOHO_LINK_LABEL = "特定商取引法に基づく表記";
