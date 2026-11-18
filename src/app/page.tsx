import { redirect } from "next/navigation";
import { HeroAnimations } from "@/components/landing/HeroAnimations";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingHero } from "@/components/landing/LandingHero";
import { getCurrentUser } from "@/lib/auth/cookies";
import { LegalLinks } from "@/components/legal/LegalLinks";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <HeroAnimations>
      <LandingHeader />
      {/* overflow-x-clip: a ilustracao decorativa (aria-hidden) do hero passa da borda em telas estreitas e
          criava rolagem horizontal em 320 px (WCAG 1.4.10). clip, e nao hidden: nao cria area de rolagem. */}
      <main className="overflow-x-clip">
        <LandingHero />
      </main>
      <footer className="px-4 py-6 sm:px-6 lg:px-8">
        <LegalLinks className="text-landing-muted" />
      </footer>
    </HeroAnimations>
  );
}
