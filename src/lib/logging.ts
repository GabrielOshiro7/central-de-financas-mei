// Ajudantes para logs do SERVIDOR sem vazar dados pessoais (LGPD art. 6o III / APPI: so o
// necessario). Regra: nunca logar e-mail completo, token/link de recuperacao, senha, corpo de
// requisicao nem o objeto de erro inteiro - os erros do Prisma carregam o trecho da consulta e,
// em erros de validacao, os valores enviados (nomes, e-mails, observacoes...).

// "gabriel@example.com" -> "g***@example.com" (mantem so o 1o caractere e o dominio, o bastante para
// depurar "qual conta" sem expor o endereco).
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

// Descricao segura de um erro para log. Erros do Prisma: so nome, codigo e modelo/campos (sem a
// mensagem, que pode conter valores). Outros erros: nome e mensagem curta.
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return typeof error === "string" ? error.slice(0, 200) : "erro desconhecido";
  const code = (error as { code?: unknown }).code;
  const meta = (error as { meta?: { modelName?: unknown; target?: unknown } }).meta;
  if (error.name.startsWith("PrismaClient")) {
    const parts = [error.name];
    if (typeof code === "string") parts.push(`[${code}]`);
    if (typeof meta?.modelName === "string") parts.push(`modelo=${meta.modelName}`);
    if (Array.isArray(meta?.target)) parts.push(`campos=${meta.target.filter((t) => typeof t === "string").join(",")}`);
    return parts.join(" ");
  }
  const firstLine = error.message.split("\n")[0].slice(0, 200);
  return `${error.name}${typeof code === "string" ? ` [${code}]` : ""}: ${firstLine}`;
}
