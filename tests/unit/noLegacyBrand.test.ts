import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

// O nome antigo do produto não pode voltar: "organizai" (sem diferenciar maiúsculas, com ou sem espaço
// no meio) não aparece em src/ nem em public/ - nem no conteúdo dos arquivos, nem no nome deles.
// Texto visível usa BRAND_NAME (src/lib/brand.ts).

// ALLOWLIST (caminhos relativos à raiz do projeto que podem conter o nome antigo). DEVE FICAR VAZIA.
// Se algum dia precisar de uma exceção, cada item exige um comentário com a justificativa (por que é
// um identificador interno que não pode mudar) e o teste "a allowlist está vazia" precisa ser ajustado
// de propósito. Hoje não há nenhuma: banco, cookies, chaves do navegador e o nome do pacote já não usam o nome.
const ALLOWLIST: string[] = [];

const LEGACY = /organiz\s*ai|organiza\s*ai/i;
const BINARY = /\.(ico|png|jpe?g|gif|webp|avif|woff2?|ttf|otf|eot|mp4|webm|pdf)$/i;

type Hit = { file: string; why: "conteúdo" | "nome do arquivo"; line?: number };

export function findLegacyBrand(root: string, dirs: string[]): Hit[] {
  const hits: Hit[] = [];
  function walk(dir: string) {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return; // pasta inexistente (ex.: public/ vazia não existe)
    }
    for (const name of names) {
      const path = join(dir, name);
      const rel = relative(root, path).split("\\").join("/");
      if (statSync(path).isDirectory()) {
        if (LEGACY.test(name)) hits.push({ file: rel, why: "nome do arquivo" });
        walk(path);
        continue;
      }
      if (LEGACY.test(name)) hits.push({ file: rel, why: "nome do arquivo" });
      if (BINARY.test(name)) continue;
      const lines = readFileSync(path, "utf8").split(/\r?\n/);
      lines.forEach((text, index) => {
        if (LEGACY.test(text)) hits.push({ file: rel, why: "conteúdo", line: index + 1 });
      });
    }
  }
  for (const dir of dirs) walk(join(root, dir));
  return hits.filter((hit) => !ALLOWLIST.includes(hit.file));
}

describe("a marca antiga não volta (organizai)", () => {
  it("a allowlist está vazia", () => {
    expect(ALLOWLIST).toEqual([]);
  });

  it("nenhuma ocorrência em src/ nem em public/ (conteúdo e nome de arquivo)", () => {
    const hits = findLegacyBrand(process.cwd(), ["src", "public"]);
    expect(hits, `Nome antigo encontrado (use BRAND_NAME de src/lib/brand.ts): ${hits.map((h) => `${h.file}${h.line ? `:${h.line}` : ""} (${h.why})`).join(", ")}`).toEqual([]);
  });

  describe("o detector pega uma ocorrência plantada (e fica quieto sem ela)", () => {
    function fixture(files: Record<string, string>) {
      const root = mkdtempSync(join(tmpdir(), "legacy-brand-"));
      for (const [path, content] of Object.entries(files)) {
        const full = join(root, path);
        mkdirSync(join(full, ".."), { recursive: true });
        writeFileSync(full, content);
      }
      return root;
    }

    it("acha no conteúdo (qualquer caixa), no nome do arquivo e com espaço no meio", () => {
      const root = fixture({
        "src/a.ts": "// ok\nexport const x = 'OrganizAI';\n",
        "src/b.tsx": "<p>ORGANIZAI</p>\n<p>organiz ai</p>",
        "public/logo/organizai-logo.svg": "<svg></svg>",
        "src/limpo.ts": "export const y = 'MyWallet';\n",
      });
      try {
        const hits = findLegacyBrand(root, ["src", "public"]);
        expect(hits.map((h) => `${h.file}${h.line ? `:${h.line}` : ""}|${h.why}`).sort()).toEqual(
          ["public/logo/organizai-logo.svg|nome do arquivo", "src/a.ts:2|conteúdo", "src/b.tsx:1|conteúdo", "src/b.tsx:2|conteúdo"].sort()
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("sem a ocorrência plantada, não acha nada", () => {
      const root = fixture({ "src/a.ts": "export const x = 'MyWallet';\n", "public/x.svg": "<svg/>" });
      try {
        expect(findLegacyBrand(root, ["src", "public"])).toEqual([]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("não confunde palavras comuns (organização, organizar) com a marca", () => {
      const root = fixture({ "src/a.ts": "// organização, organizar, organizações, reorganizar\n" });
      try {
        expect(findLegacyBrand(root, ["src"])).toEqual([]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
