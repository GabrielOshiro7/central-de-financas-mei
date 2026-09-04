import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import type { Business, User } from "@prisma/client";

// Usado pelo layout do route group (app): exige login E onboarding
// concluido. E a validacao "de verdade" - o proxy.ts so faz a checagem
// otimista de cookie antes disso.
export async function requireOnboardedUser(): Promise<{
  user: Pick<User, "id" | "name" | "email">;
  business: Business;
}> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business || !business.onboardingCompleted) {
    redirect("/onboarding");
  }

  return { user, business };
}
