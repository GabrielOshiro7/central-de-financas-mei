import { stripDiacritics } from "@/lib/text";

// Normaliza para comparacao tolerante a maiuscula/minuscula, espacos extras e
// acentos (secao 4 da Etapa 3 + reforcado na Etapa 3.1: "Salario"/"Salário"
// devem casar). Sem dependencias de servidor (nada de Prisma aqui) para
// poder ser reaproveitada tambem no client (ex.: ImportWizard reclassificando
// uma linha ao vivo quando o usuario edita o campo categoria na previa).
export function normalizeCategoryName(name: string): string {
  return stripDiacritics(name.trim().replace(/\s+/g, " ").toLowerCase());
}
