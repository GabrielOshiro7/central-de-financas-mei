import Link from "next/link";
import { LogoMark } from "@/components/Logo";

/**
 * Logo "OrganizAI" da landing (ícone + wordmark + subtítulo). O wordmark usa
 * a fonte padrão do site (Geist, já carregada em layout.tsx) com
 * currentColor via herança de cor do <Link>, não SVG <text> — isso já
 * inverte preto/branco entre light/dark e já tem a transição de 0.2s global
 * de `color` de graça, sem precisar de filter.
 */
export function LandingLogo() {
  return (
    <Link
      href="/"
      className="flex min-w-0 items-center gap-2.5 text-landing-foreground sm:gap-3"
      aria-label="Página inicial"
    >
      <LogoMark className="h-9 w-9 sm:h-10 sm:w-10" />
      <span className="flex min-w-0 flex-col justify-center">
        <span className="truncate text-xl leading-tight font-bold tracking-tight whitespace-nowrap sm:text-2xl">
          OrganizAI
        </span>
        <span className="text-[9px] leading-none font-semibold tracking-[0.3em] text-landing-foreground/60 sm:text-[10px]">
          ORGANIZAI
        </span>
      </span>
    </Link>
  );
}
