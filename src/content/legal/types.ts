// Estrutura dos textos legais (Politica de Privacidade, Termos de Servico, Cookies).
// Os textos vivem em arquivos de conteudo (src/content/legal/*.ts), faceis de editar, com
// versao e data de vigencia (meta.ts). Sao RASCUNHOS para revisao juridica: o que nao
// esta no codigo vira um marcador [PREENCHER: ...] e o que exige parecer juridico vira
// [VERIFICAR COM ADVOGADO: ...]. Enquanto houver marcador, as paginas mostram a faixa
// "Rascunho - em revisao" (LEGAL_DOCS_DRAFT em meta.ts).
export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  // Nota em destaque (ex.: aviso a revisar com o advogado).
  | { type: "note"; text: string }
  // Tabela de cookies/armazenamento local, gerada do inventario (cookieInventory.ts).
  | { type: "cookie-table" }
  // Tabela generica (cabecalho + linhas).
  | { type: "table"; head: string[]; rows: string[][] };

export type LegalSection = { id: string; title: string; blocks: LegalBlock[] };

export type LegalDocument = {
  slug: "privacidade" | "termos" | "cookies";
  title: string;
  version: string;
  // "AAAA-MM-DD" ou um marcador [PREENCHER: ...] enquanto nao definida.
  effectiveDate: string;
  intro?: string;
  sections: LegalSection[];
};

// Marcadores que indicam texto ainda nao finalizado.
export const LEGAL_MARKER_REGEX = /\[(?:PREENCHER|VERIFICAR COM ADVOGADO)[^\]]*\]/g;

function blockStrings(block: LegalBlock): string[] {
  switch (block.type) {
    case "p":
    case "note":
      return [block.text];
    case "ul":
      return block.items;
    case "table":
      return [...block.head, ...block.rows.flat()];
    case "cookie-table":
      return [];
  }
}

// Todos os textos do documento (titulo, vigencia, introducao, secoes e blocos).
export function legalDocumentStrings(doc: LegalDocument): string[] {
  return [
    doc.title,
    doc.version,
    doc.effectiveDate,
    doc.intro ?? "",
    ...doc.sections.flatMap((section) => [section.title, ...section.blocks.flatMap(blockStrings)]),
  ];
}

// Marcadores [PREENCHER...] / [VERIFICAR COM ADVOGADO...] encontrados no documento.
export function findLegalMarkers(doc: LegalDocument): string[] {
  return legalDocumentStrings(doc).flatMap((text) => text.match(LEGAL_MARKER_REGEX) ?? []);
}
