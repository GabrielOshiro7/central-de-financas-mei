import { NextResponse } from "next/server";
import { REACCEPT_PATH, needsReaccept, type LegalAcceptanceFields } from "@/lib/legal/acceptance";

// Resposta das rotas de API do app para um usuario com reaceite dos documentos legais pendente
// (so quando o mecanismo esta ligado - ver acceptance.ts). Chamada logo depois da checagem de
// login, em TODA rota autenticada do app. Ficam de fora so as rotas da lista unica
// REACCEPT_EXEMPT_API_PREFIXES (src/lib/legal/reacceptExempt.ts): leia o comentario de la antes de
// criar rotas de exportacao de dados ou exclusao de conta. Um teste varre as rotas e falha se alguma
// esquecer a chamada (tests/unit/legalReacceptRoutes.test.ts).
export const LEGAL_REACCEPT_ERROR_CODE = "LEGAL_REACCEPT_REQUIRED";
export const LEGAL_REACCEPT_MESSAGE = "Para continuar, aceite os Termos de Serviço e a Política de Privacidade atualizados.";

export function legalReacceptBlock(user: LegalAcceptanceFields): NextResponse | null {
  if (!needsReaccept(user)) return null;
  return NextResponse.json(
    {
      error: LEGAL_REACCEPT_MESSAGE,
      code: LEGAL_REACCEPT_ERROR_CODE,
      reacceptUrl: REACCEPT_PATH,
    },
    { status: 403 }
  );
}

// Equivalente para SERVER ACTIONS ("use server"): uma action nao devolve uma resposta HTTP que
// o proprio codigo controla, entao o guard LANCA este erro (status 403 e o mesmo codigo da API) e
// quem chama a action trata. Hoje o projeto nao tem nenhuma server action; o teste
// tests/unit/legalServerActions.test.ts falha se surgir uma que nao chame requireLegalAcceptanceForAction.
export class LegalReacceptRequiredError extends Error {
  readonly code = LEGAL_REACCEPT_ERROR_CODE;
  readonly status = 403;
  readonly reacceptUrl = REACCEPT_PATH;

  constructor() {
    super(LEGAL_REACCEPT_MESSAGE);
    this.name = "LegalReacceptRequiredError";
  }
}

// Chamar no comeco de toda server action, logo depois de obter o usuario da sessao.
export function requireLegalAcceptanceForAction(user: LegalAcceptanceFields): void {
  if (needsReaccept(user)) throw new LegalReacceptRequiredError();
}
