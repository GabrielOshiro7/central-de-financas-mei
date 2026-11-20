import { compareVersions } from "@/lib/legal/acceptance";
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from "@/content/legal/meta";

// Resumo do que mudou em cada versao dos documentos, mostrado na pagina de reaceite (/reaceite)
// a quem aceitou uma versao anterior. Regra: ao subir TERMS_VERSION ou PRIVACY_POLICY_VERSION em
// meta.ts, acrescente aqui a entrada da versao nova (um teste falha se faltar). Texto curto, em
// linguagem simples, e so o que de fato mudou no texto.
export type VersionChange = { version: string; summary: string[] };

export const TERMS_CHANGES: VersionChange[] = [
  { version: "0.1", summary: ["Primeira versão dos Termos de Serviço."] },
  {
    version: "0.2",
    summary: ["Nova seção sobre a assinatura do serviço pago (planos, cobrança, renovação e cancelamento) e ligação com a página exigida pela lei japonesa de transações comerciais."],
  },
  {
    version: "0.3",
    summary: ["O sistema deixou de ter o tipo de lançamento \"Custo\": a descrição passa a falar só em receitas e despesas."],
  },
];

export const PRIVACY_CHANGES: VersionChange[] = [
  { version: "0.1", summary: ["Primeira versão da Política de Privacidade."] },
  { version: "0.2", summary: ["Passa a descrever o provedor de cobrança de terceiros, por causa do serviço pago por assinatura."] },
  {
    version: "0.3",
    summary: ["Declaração de maioridade no cadastro (caixa de aceite) e registro do aceite também quando você aceita os documentos de novo."],
  },
  {
    version: "0.4",
    summary: [
      "Passa a dizer quando sessões e links de recuperação de senha vencidos são apagados do banco de dados (24 horas depois do vencimento, por uma limpeza que roda após logins e pedidos de recuperação de senha).",
      "O novo aceite dos documentos também traz a declaração de ter a idade mínima.",
    ],
  },
  {
    version: "0.5",
    summary: ["O sistema deixou de ter o tipo de lançamento \"Custo\": os dados tratados passam a ser descritos como lançamentos de receitas e despesas."],
  },
];

// Entradas ainda NAO aceitas: as versoes maiores que a aceita (todas, se nunca aceitou).
export function changesSince(changes: VersionChange[], accepted: string | null): VersionChange[] {
  return changes.filter((change) => accepted === null || compareVersions(change.version, accepted) > 0);
}

export type ChangeSummary = {
  // true quando o usuario nunca registrou aceite (contas anteriores a esta funcao).
  firstAcceptance: boolean;
  terms: VersionChange[];
  privacy: VersionChange[];
};

export function summarizeChanges(user: { legalAcceptedAt: Date | null; termsVersion: string | null; privacyVersion: string | null }): ChangeSummary {
  return {
    firstAcceptance: !user.legalAcceptedAt,
    terms: changesSince(TERMS_CHANGES, user.termsVersion),
    privacy: changesSince(PRIVACY_CHANGES, user.privacyVersion),
  };
}

// Para o teste: as versoes vigentes tem de ter resumo.
export const CURRENT_VERSIONS = { terms: TERMS_VERSION, privacy: PRIVACY_POLICY_VERSION };
