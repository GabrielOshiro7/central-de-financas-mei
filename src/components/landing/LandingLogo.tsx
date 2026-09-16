import Link from "next/link";

/**
 * Reaproveita a marca placeholder já usada em src/app/layout.tsx (metadata)
 * e na página inicial anterior ("N" + "Nome do Sistema") — o produto ainda
 * não tem nome/logo definidos, então não inventamos um novo aqui.
 */
export function LandingLogo() {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2 sm:gap-2.5" aria-label="Página inicial">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-landing-foreground text-sm font-bold text-white sm:h-9 sm:w-9 sm:text-base">
        N
      </span>
      <span className="truncate text-sm font-semibold whitespace-nowrap text-landing-foreground sm:text-base">
        Nome do Sistema
      </span>
    </Link>
  );
}
