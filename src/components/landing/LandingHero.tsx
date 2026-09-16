import { HeroVisual } from "./HeroVisual";
import { LandingButton } from "./LandingButton";

export function LandingHero() {
  return (
    <section className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col items-center justify-center gap-12 px-4 py-16 sm:px-6 lg:min-h-[80vh] lg:flex-row lg:items-center lg:gap-8 lg:px-8 lg:py-0">
      <div className="w-full max-w-xl text-center lg:w-[48%] lg:text-left">
        <h1
          data-anim="hero-title"
          className="text-[44px] font-bold leading-tight tracking-tight text-landing-foreground sm:text-[56px] lg:text-[72px]"
        >
          Sua empresa. Mais inteligente.
        </h1>

        <p
          data-anim="hero-subtitle"
          className="mx-auto mt-7 max-w-md text-[17px] leading-[1.7] text-landing-muted lg:mx-0 lg:text-lg"
        >
          Tenha seus números, sua operação e suas decisões organizados em um só lugar.
        </p>

        <div
          data-anim="hero-buttons"
          className="mt-9 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start"
        >
          <LandingButton href="/login" variant="outline" size="md">
            Entrar
          </LandingButton>
          <LandingButton href="/register" variant="primary" size="md">
            Criar conta
          </LandingButton>
        </div>
      </div>

      <div className="w-full lg:w-[52%]">
        <HeroVisual />
      </div>
    </section>
  );
}
