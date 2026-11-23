import { Prisma } from "@prisma/client";

// Busca de cliente por telefone/WhatsApp ignorando a formatacao: o termo e comparado so pelos DIGITOS com os digitos
// gravados em phone/whatsapp (sem espaco, hifen, parenteses, ponto nem "+"). "090-1234" acha "09012345678" e
// "+55 11 9" acha "5511 9...". O que esta gravado NAO e alterado nem recusado (texto livre, como antes) e nao ha
// migracao: a normalizacao da coluna e feita na propria consulta (regexp_replace do Postgres).
//
// So vale para termo que PARECE numero de telefone (digitos e a pontuacao de telefone, sem letras): um nome como
// "Sala 3" nao vira busca por telefone. A consulta e sempre PARAMETRIZADA (Prisma.sql): o termo nunca e concatenado
// no SQL; alem disso aqui so sobram digitos (%, _ e aspas nem chegam a existir).
const PHONE_LIKE_TERM = /^[\d\s+\-().]+$/;

export function phoneSearchDigits(term: string): string | null {
  const trimmed = term.trim();
  if (!trimmed || !PHONE_LIKE_TERM.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

// Fragmento SQL "OR (digitos de phone/whatsapp contem o termo)" para a tabela clients com alias `c`; vazio se o
// termo nao e numerico.
export function phoneDigitsOrClause(term: string): Prisma.Sql {
  const digits = phoneSearchDigits(term);
  if (!digits) return Prisma.empty;
  const like = `%${digits}%`;
  return Prisma.sql`OR regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') LIKE ${like} OR regexp_replace(coalesce(c.whatsapp, ''), '[^0-9]', '', 'g') LIKE ${like}`;
}
