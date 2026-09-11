import { getAIProvider } from "@/lib/ai/provider";
import type { InsightDraft } from "@/lib/insights/rules";

// Extrai sequencias "numero-like" (digitos + separadores de milhar/decimal)
// de um texto livre - usado tanto para montar a whitelist a partir do texto
// do proprio draft quanto para varrer a resposta da IA em busca de numeros a
// validar. Nao tenta distinguir moeda/percentual/pontos - o que importa para
// a checagem de integridade e a MAGNITUDE numerica, nao a unidade.
function extractNumberTokens(text: string): string[] {
  return text.match(/-?\d[\d.,]*\d|-?\d/g) ?? [];
}

// Normaliza um token numerico para uma forma canonica comparavel,
// independente de convencao de separador decimal/milhar (en-US: "1,234.56"
// vs. pt-BR: "1.234,56") - a IA e instruida a escrever em portugues natural
// e pode reformatar um numero para a convencao pt-BR mesmo copiando o MESMO
// valor que recebeu (formatMoney deste projeto usa convencao en-US, ver
// src/lib/money.ts). Retorna null quando o token nao e um numero valido.
function normalizeNumberToken(raw: string): string | null {
  let s = raw;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (hasComma) {
    const digitsAfter = s.length - s.lastIndexOf(",") - 1;
    s = digitsAfter === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot) {
    const digitsAfter = s.length - s.lastIndexOf(".") - 1;
    if (digitsAfter === 3) s = s.replace(/\./g, "");
  }

  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return n.toFixed(2);
}

// A whitelist e o conjunto exato de numeros que JA aparecem no texto
// deterministico do proprio draft (title/description/recommendation,
// montados por rules.ts a partir dos valores reais do snapshot) - nunca
// recalculada a partir dos campos Decimal crus, para nao duplicar o
// conhecimento de "qual formatador usar para qual metrica" que ja vive em
// rules.ts. Qualquer numero na saida da IA fora deste conjunto (normalizado)
// e tratado como inventado.
export function buildWhitelist(draft: InsightDraft): Set<string> {
  const text = [draft.title, draft.description, draft.recommendation ?? ""].join(" ");
  const tokens = extractNumberTokens(text).map(normalizeNumberToken).filter((t): t is string => t !== null);
  return new Set(tokens);
}

function isWithinWhitelist(text: string, whitelist: Set<string>): boolean {
  const tokens = extractNumberTokens(text).map(normalizeNumberToken).filter((t): t is string => t !== null);
  return tokens.every((t) => whitelist.has(t));
}

type AIRewrite = { description: string; recommendation: string | null };

function parseAIResponse(raw: string): AIRewrite | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "description" in parsed &&
      typeof (parsed as { description: unknown }).description === "string"
    ) {
      const recommendation = (parsed as { recommendation?: unknown }).recommendation;
      return {
        description: (parsed as { description: string }).description,
        recommendation: typeof recommendation === "string" ? recommendation : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function buildPrompt(draft: InsightDraft): string {
  return [
    "Reescreva o texto abaixo em português natural, mais fluido, SEM alterar nenhum número, data ou nome citado.",
    "Responda APENAS com um JSON no formato exato {\"description\": string, \"recommendation\": string | null}, sem nenhum texto fora do JSON.",
    `Título: ${draft.title}`,
    `Descrição atual: ${draft.description}`,
    `Recomendação atual: ${draft.recommendation ?? "(nenhuma)"}`,
  ].join("\n");
}

// Tenta reescrever a narrativa de um insight via IA, sem NUNCA arriscar a
// integridade numerica. Em qualquer cenario de falha - provedor nulo/nao
// configurado, timeout, erro de rede, resposta que nao e JSON valido, ou
// JSON valido mas com algum numero fora da whitelist do proprio draft -
// retorna o draft ORIGINAL inalterado (narrativeSource permanece
// "template"). So substitui description/recommendation quando TODOS os
// numeros da resposta batem com a whitelist.
export async function enrichWithAI(draft: InsightDraft): Promise<InsightDraft> {
  const provider = getAIProvider();
  let raw: string | null;
  try {
    raw = await provider.generateText(buildPrompt(draft), { timeoutMs: 5000 });
  } catch {
    raw = null;
  }
  if (raw === null) return draft;

  const rewrite = parseAIResponse(raw);
  if (rewrite === null) return draft;

  const whitelist = buildWhitelist(draft);
  const combinedText = `${rewrite.description} ${rewrite.recommendation ?? ""}`;
  if (!isWithinWhitelist(combinedText, whitelist)) return draft;

  return {
    ...draft,
    description: rewrite.description,
    recommendation: rewrite.recommendation,
    narrativeSource: "ai",
  };
}
