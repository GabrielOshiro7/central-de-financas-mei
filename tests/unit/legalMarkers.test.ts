import { describe, it, expect } from "vitest";
import { LEGAL_DOCUMENTS } from "@/content/legal";
import { LEGAL_DOCS_DRAFT, PRIVACY_POLICY_VERSION, TERMS_VERSION, COOKIE_NOTICE_COOKIE } from "@/content/legal/meta";
import { STORAGE_INVENTORY } from "@/content/legal/cookieInventory";
import { findLegalMarkers, legalDocumentStrings, type LegalDocument } from "@/content/legal/types";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { THEME_COOKIE } from "@/lib/theme";

// Os textos legais sao RASCUNHOS: o que nao esta no codigo vira [PREENCHER: ...] e o que
// exige parecer juridico vira [VERIFICAR COM ADVOGADO: ...]. A faixa "Rascunho - em
// revisao" e controlada por LEGAL_DOCS_DRAFT.
const doc = (overrides: Partial<LegalDocument>): LegalDocument => ({
  slug: "termos",
  title: "T",
  version: "1",
  effectiveDate: "2026-01-01",
  sections: [],
  ...overrides,
});

describe("detecção de marcadores", () => {
  it("acha [PREENCHER: ...] e [VERIFICAR COM ADVOGADO: ...] em qualquer campo de texto", () => {
    const d = doc({
      title: "Título [PREENCHER: x]",
      effectiveDate: "[PREENCHER: data]",
      intro: "ok",
      sections: [
        {
          id: "a",
          title: "Seção [VERIFICAR COM ADVOGADO: y]",
          blocks: [
            { type: "p", text: "texto [PREENCHER: contato] fim" },
            { type: "ul", items: ["a", "b [PREENCHER: item]"] },
            { type: "note", text: "[VERIFICAR COM ADVOGADO: nota]" },
            { type: "table", head: ["h"], rows: [["[PREENCHER: célula]"]] },
          ],
        },
      ],
    });
    expect(findLegalMarkers(d)).toEqual([
      "[PREENCHER: x]",
      "[PREENCHER: data]",
      "[VERIFICAR COM ADVOGADO: y]",
      "[PREENCHER: contato]",
      "[PREENCHER: item]",
      "[VERIFICAR COM ADVOGADO: nota]",
      "[PREENCHER: célula]",
    ]);
  });

  it("documento sem marcadores devolve lista vazia (colchetes comuns não contam)", () => {
    const d = doc({ sections: [{ id: "a", title: "A", blocks: [{ type: "p", text: "veja [1] e [nota] e [PREENCHA]" }] }] });
    expect(findLegalMarkers(d)).toEqual([]);
  });
});

describe("documentos legais reais", () => {
  it("se LEGAL_DOCS_DRAFT for false, NENHUM marcador pode existir nos textos", () => {
    if (LEGAL_DOCS_DRAFT) return; // enquanto for rascunho, marcadores são permitidos
    const found = LEGAL_DOCUMENTS.flatMap((d) => findLegalMarkers(d).map((m) => `${d.slug}: ${m}`));
    expect(found).toEqual([]);
  });

  it("se ainda há marcadores, LEGAL_DOCS_DRAFT precisa ser true (a faixa não pode sumir)", () => {
    const hasMarkers = LEGAL_DOCUMENTS.some((d) => findLegalMarkers(d).length > 0);
    if (hasMarkers) expect(LEGAL_DOCS_DRAFT).toBe(true);
  });

  it("as três páginas existem, com versão e vigência, e a Política e os Termos têm marcadores a revisar", () => {
    expect(LEGAL_DOCUMENTS.map((d) => d.slug)).toEqual(["privacidade", "termos", "cookies"]);
    for (const d of LEGAL_DOCUMENTS) {
      expect(d.version).toMatch(/^\d+\.\d+/);
      expect(d.effectiveDate.length).toBeGreaterThan(0);
      expect(d.sections.length).toBeGreaterThan(0);
      expect(new Set(d.sections.map((s) => s.id)).size).toBe(d.sections.length); // ids únicos (âncoras)
      expect(legalDocumentStrings(d).every((t) => typeof t === "string")).toBe(true);
    }
    const [privacy, terms] = LEGAL_DOCUMENTS;
    expect(privacy.version).toBe(PRIVACY_POLICY_VERSION);
    expect(terms.version).toBe(TERMS_VERSION);
    expect(findLegalMarkers(privacy).length).toBeGreaterThan(0);
    expect(findLegalMarkers(terms).length).toBeGreaterThan(0);
  });

  it("a Política cita o LGPD como [VERIFICAR COM ADVOGADO] e os Termos citam lei/foro e idade mínima como [PREENCHER]", () => {
    const privacy = legalDocumentStrings(LEGAL_DOCUMENTS[0]).join("\n");
    const terms = legalDocumentStrings(LEGAL_DOCUMENTS[1]).join("\n");
    expect(privacy).toMatch(/\[VERIFICAR COM ADVOGADO:[^\]]*LGPD/);
    expect(terms).toMatch(/\[PREENCHER: lei aplicável/);
    expect(terms).toMatch(/\[PREENCHER: foro/);
    expect(terms).toMatch(/\[PREENCHER: idade mínima/);
    expect(terms).toMatch(/\[VERIFICAR COM ADVOGADO:[^\]]*limitação de responsabilidade/);
  });
});

describe("inventário de cookies bate com o código", () => {
  it("lista o cookie de sessão, o de tema, o do aviso e o localStorage da barra lateral, com o mesmo nome do código", () => {
    const names = STORAGE_INVENTORY.map((i) => `${i.kind}:${i.name}`);
    expect(names).toEqual([`cookie:${SESSION_COOKIE_NAME}`, `cookie:${THEME_COOKIE}`, `cookie:${COOKIE_NOTICE_COOKIE}`, "localStorage:sidebar-collapsed"]);
  });

  it("só essenciais e de preferência; o cookie de sessão é HttpOnly", () => {
    expect(new Set(STORAGE_INVENTORY.map((i) => i.category))).toEqual(new Set(["essencial", "preferência"]));
    expect(STORAGE_INVENTORY.find((i) => i.name === SESSION_COOKIE_NAME)?.details).toContain("HttpOnly");
  });
});
