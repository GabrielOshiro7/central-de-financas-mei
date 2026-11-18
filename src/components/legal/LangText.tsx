import { Fragment } from "react";

// Idioma de partes da pagina (WCAG 3.1.2): a pagina e pt-BR, mas os textos legais trazem trechos em
// japones (ex.: 特定商取引法に基づく表記). Cada trecho japones fica num <span lang="ja">, para o leitor de
// tela trocar a voz/pronuncia. Trecho = sequencia de kanji, hiragana, katakana, pontuacao CJK e
// caracteres de largura total (com os espacos entre eles).
const CJK = "\\u3000-\\u303f\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uff00-\\uffef";
const JAPANESE_RUN = new RegExp(`([${CJK}][${CJK}\\s]*)`);
const HAS_JAPANESE = new RegExp(`[${CJK}]`);

export function LangText({ text }: { text: string }) {
  if (!HAS_JAPANESE.test(text)) return <>{text}</>;
  // split com grupo de captura: os trechos japoneses ficam nos indices impares.
  const parts = text.split(JAPANESE_RUN);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <span key={index} lang="ja">
            {part}
          </span>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        )
      )}
    </>
  );
}
