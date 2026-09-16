import { LandingButton } from "./LandingButton";
import { LandingLogo } from "./LandingLogo";

export function LandingHeader() {
  return (
    <header
      data-anim="header"
      className="sticky top-0 z-10 border-b border-landing-border/70 bg-landing-background/80 backdrop-blur"
    >
      <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between px-4 sm:h-20 sm:px-6 lg:px-8">
        <LandingLogo />
        <nav className="flex shrink-0 items-center gap-2 sm:gap-3" aria-label="Autenticação">
          <LandingButton href="/login" variant="outline" size="sm">
            Entrar
          </LandingButton>
          <LandingButton href="/register" variant="primary" size="sm">
            Criar conta
          </LandingButton>
        </nav>
      </div>
    </header>
  );
}
