import { useId } from "react";
import { BRAND_NAME } from "@/lib/brand";
import { SYMBOL_ASPECT, SYMBOL_VIEWBOX } from "./brandPaths";
import { SymbolArtwork } from "./SymbolArtwork";

// So o simbolo da marca (barra lateral recolhida, telas estreitas, tamanhos abaixo de
// MIN_FULL_LOGO_HEIGHT). SVG inline: a parte escura herda a cor de texto do contexto (currentColor) e o
// laranja usa o token de acento. `height` em px (largura = altura); `className` pode sobrescrever o
// tamanho por CSS. O nome acessivel e BRAND_NAME; dentro de um link, o nome do link sai daqui.
export function BrandSymbol({ height = 32, className = "" }: { height?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={SYMBOL_VIEWBOX}
      width={height * SYMBOL_ASPECT}
      height={height}
      role="img"
      aria-label={BRAND_NAME}
      focusable="false"
      data-brand="symbol"
      className={`shrink-0 ${className}`.trim()}
    >
      <SymbolArtwork idA={`mw-a-${uid}`} idB={`mw-b-${uid}`} />
    </svg>
  );
}
