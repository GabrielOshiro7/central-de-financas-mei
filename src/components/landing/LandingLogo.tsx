import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BrandSymbol } from "@/components/brand/BrandSymbol";
import { BRAND_NAME } from "@/lib/brand";

/**
 * Logo da marca no cabecalho da landing. A cor escura da logo herda a cor de texto do <Link>
 * (text-landing-foreground), entao inverte sozinha entre claro e escuro (e ganha a transicao global de
 * `color`); o laranja e o token de acento. No celular (abaixo de sm) so o simbolo, para caber com os
 * botoes do cabecalho sem estourar a largura; de sm para cima, a logo completa. So um dos dois aparece
 * por vez (o outro fica com display:none, fora da arvore de acessibilidade): o nome acessivel do link e
 * BRAND_NAME.
 */
export function LandingLogo() {
  return (
    <Link href="/" title={BRAND_NAME} className="flex min-w-0 shrink-0 items-center text-landing-foreground">
      <BrandSymbol height={32} className="block sm:hidden" />
      <BrandLogo height={40} className="hidden h-10 w-auto sm:block" />
    </Link>
  );
}
