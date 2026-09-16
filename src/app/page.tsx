import { redirect } from "next/navigation";
import { HeroAnimations } from "@/components/landing/HeroAnimations";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingHero } from "@/components/landing/LandingHero";
import { getCurrentUser } from "@/lib/auth/cookies";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <HeroAnimations>
      <LandingHeader />
      <main>
        <LandingHero />
      </main>
    </HeroAnimations>
  );
}
