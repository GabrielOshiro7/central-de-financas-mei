import {
  CLIP_A_POINTS,
  CLIP_B_POINTS,
  SYMBOL_STROKE_D,
  SYMBOL_STROKE_LINECAP,
  SYMBOL_STROKE_LINEJOIN,
  SYMBOL_STROKE_WIDTH,
} from "./brandPaths";

// Desenho do simbolo (o traco em duas cores), compartilhado por BrandSymbol e BrandLogo: o mesmo
// caminho e desenhado duas vezes, recortado por dois clipPath. A parte escura herda a cor de texto do
// contexto (currentColor); o laranja usa o token de acento (--color-ember, #D9541E).
// `idA`/`idB`: ids dos clipPath, unicos por instancia (vem de useId nos componentes), para nao haver
// ids duplicados quando duas logos aparecem na mesma pagina.
export function SymbolArtwork({ idA, idB }: { idA: string; idB: string }) {
  return (
    <>
      <defs>
        <clipPath id={idA}>
          <polygon points={CLIP_A_POINTS} />
        </clipPath>
        <clipPath id={idB}>
          <polygon points={CLIP_B_POINTS} />
        </clipPath>
      </defs>
      <g fill="none" strokeWidth={SYMBOL_STROKE_WIDTH} strokeLinecap={SYMBOL_STROKE_LINECAP} strokeLinejoin={SYMBOL_STROKE_LINEJOIN}>
        <path className="mw-d" clipPath={`url(#${idA})`} stroke="currentColor" d={SYMBOL_STROKE_D} />
        <path className="stroke-ember" clipPath={`url(#${idB})`} d={SYMBOL_STROKE_D} />
      </g>
    </>
  );
}
