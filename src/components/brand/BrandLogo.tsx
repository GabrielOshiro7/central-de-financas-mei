import { useId } from "react";
import { BRAND_NAME, MIN_FULL_LOGO_HEIGHT } from "@/lib/brand";
import { DIVIDER, LOGO_ASPECT, LOGO_VIEWBOX, WORDMARK_ACCENT_D, WORDMARK_DARK_D } from "./brandPaths";
import { BrandSymbol } from "./BrandSymbol";
import { SymbolArtwork } from "./SymbolArtwork";

// Logo completa: simbolo + barra vertical + "MyWallet". SVG inline; as partes escuras herdam a cor de
// texto do contexto (currentColor: #111111 em pagina clara, a cor de texto da barra lateral ou o cinza
// claro do tema escuro) e o laranja usa o token de acento. `height` em px; `className` pode sobrescrever o
// tamanho por CSS (ex.: "h-7 w-auto sm:h-9").
//
// REGRA: a logo completa so e usada com MIN_FULL_LOGO_HEIGHT (28px) de altura ou mais; abaixo disso este
// componente devolve so o simbolo (BrandSymbol).
//
// EXCECAO REGISTRADA a regra "acento nunca em texto pequeno": o laranja de "Wallet" faz parte da logo
// (logotipo, isento de contraste WCAG 1.4.3); nao vale para nenhum outro texto.
export function BrandLogo({ height = 32, className = "" }: { height?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (height < MIN_FULL_LOGO_HEIGHT) return <BrandSymbol height={height} className={className} />;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={LOGO_VIEWBOX}
      width={Math.round(height * LOGO_ASPECT * 100) / 100}
      height={height}
      role="img"
      aria-label={BRAND_NAME}
      focusable="false"
      data-brand="logo"
      className={`shrink-0 ${className}`.trim()}
    >
      <SymbolArtwork idA={`mw-a-${uid}`} idB={`mw-b-${uid}`} />
      <rect x={DIVIDER.x} y={DIVIDER.y} width={DIVIDER.width} height={DIVIDER.height} fill="currentColor" />
      <path fill="currentColor" fillRule="evenodd" d={WORDMARK_DARK_D} />
      <path className="fill-ember" fillRule="evenodd" d={WORDMARK_ACCENT_D} />
    </svg>
  );
}
