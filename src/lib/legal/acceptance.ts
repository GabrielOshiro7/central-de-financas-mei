import { LEGAL_DOCS_DRAFT, PRIVACY_POLICY_VERSION, TERMS_VERSION } from "@/content/legal/meta";

// Reaceite dos documentos legais.
//
// O usuario grava, no cadastro (ou no reaceite), QUANDO aceitou e QUAIS versoes dos Termos e da
// Politica (users.legal_accepted_at / terms_version / privacy_version). Quando a versao vigente
// passa a ser maior que a aceita - ou quando nunca houve aceite (NULL) - o usuario precisa
// aceitar de novo antes de usar o app (pagina /reaceite).
//
// O mecanismo fica DESLIGADO enquanto LEGAL_DOCS_DRAFT for true: os textos ainda sao rascunho,
// e exigir aceite de um rascunho nao tem valor. Ao virar false, liga sozinho.

// Campos do usuario que o mecanismo le (os mesmos da tabela users).
export type LegalAcceptanceFields = {
  legalAcceptedAt: Date | null;
  termsVersion: string | null;
  privacyVersion: string | null;
};

// Rota de aceite: mesma da pagina /reaceite e do cliente.
export const REACCEPT_PATH = "/reaceite";

// So para o teste ponta a ponta (playwright.config.ts liga esta variavel no servidor de teste):
// forca o mecanismo mesmo com o rascunho ligado. Nunca vale em producao.
export const REACCEPT_FORCE_ENV = "LEGAL_REACCEPT_FORCE";

export function isReacceptEnabled(draft: boolean = LEGAL_DOCS_DRAFT, env: Record<string, string | undefined> = process.env): boolean {
  if (!draft) return true;
  return env.NODE_ENV !== "production" && env[REACCEPT_FORCE_ENV] === "1";
}

// Compara versoes "0.2", "1.10" etc. campo a campo, numericamente: negativo se a < b, 0 se iguais.
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(pa.length, pb.length);
  for (let i = 0; i < length; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Versao aceita esta em dia? (nula = nunca aceitou)
function isCurrent(accepted: string | null, current: string): boolean {
  return accepted !== null && compareVersions(accepted, current) >= 0;
}

// O que falta o usuario aceitar, independente de o mecanismo estar ligado.
export function acceptancePending(user: LegalAcceptanceFields, current: { terms: string; privacy: string } = { terms: TERMS_VERSION, privacy: PRIVACY_POLICY_VERSION }): boolean {
  return !user.legalAcceptedAt || !isCurrent(user.termsVersion, current.terms) || !isCurrent(user.privacyVersion, current.privacy);
}

// Decisao final: reaceite pendente E mecanismo ligado. E o que guards e rotas consultam.
export function needsReaccept(user: LegalAcceptanceFields): boolean {
  return isReacceptEnabled() && acceptancePending(user);
}

// Dados gravados ao aceitar (cadastro e reaceite): data/hora de agora e as versoes VIGENTES -
// nunca versoes vindas do cliente.
export function currentAcceptanceData(now: Date = new Date()) {
  return { legalAcceptedAt: now, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_POLICY_VERSION };
}
