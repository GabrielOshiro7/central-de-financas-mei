import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUserWithReason } from "@/lib/auth/cookies";
import { isSessionElevated } from "@/lib/auth/session";
import type { Business, User } from "@prisma/client";

// Usado pelo layout do route group (app): exige login E onboarding
// concluido. E a validacao "de verdade" - o proxy.ts so faz a checagem
// otimista de cookie antes disso.
export async function requireOnboardedUser(): Promise<{
  user: Pick<User, "id" | "name" | "email">;
  business: Business;
}> {
  const { user, reason } = await getCurrentUserWithReason();
  if (!user) {
    if (reason === "inactivity") redirect("/login?reason=inactivity");
    if (reason === "absolute") redirect("/login?reason=expired");
    redirect("/login");
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business || !business.onboardingCompleted) {
    redirect("/onboarding");
  }

  return { user, business };
}

// Reautenticacao para acoes sensiveis (step-up/"sudo mode", Etapa
// sessao-expiracao-reauth). Chamado DENTRO da propria rota/mutation que
// executa a acao sensivel - nunca so no frontend, um botao desabilitado no
// cliente nao impede uma chamada direta a API. Devolve null quando a
// sessao esta elevada (segue em frente); devolve uma mensagem de erro
// pronta para a rota responder 403 quando nao esta.
export function requireElevatedSession(session: { elevatedUntil: Date | null } | null): string | null {
  if (!session || !isSessionElevated(session)) {
    return "REAUTH_REQUIRED";
  }
  return null;
}
