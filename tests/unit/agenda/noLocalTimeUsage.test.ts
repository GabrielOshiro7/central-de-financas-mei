import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// Guarda estatica (Etapa 8): src/lib/agenda so pode resolver dia/hora via
// Intl.DateTimeFormat com timeZone explicito (ver time.ts) - getters/setters
// LOCAIS do Date refletiriam o fuso do processo Node (do host), nunca
// necessariamente Asia/Tokyo. Este teste falha se qualquer arquivo de
// src/lib/agenda usar um desses metodos, mesmo que o autor "esqueça" e o
// resto da suite continue passando por coincidencia (ex.: o host de dev
// atual ja roda em Asia/Tokyo).
const FORBIDDEN_METHODS = ["getHours", "getDate", "getDay", "getMonth", "getFullYear", "setHours"];
const FORBIDDEN_PATTERNS = FORBIDDEN_METHODS.map((name) => ({ name, pattern: new RegExp(`\\.${name}\\s*\\(`) }));

const AGENDA_LIB_DIR = join(process.cwd(), "src", "lib", "agenda");

function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...listTsFiles(fullPath));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("src/lib/agenda nunca usa data/hora local do host", () => {
  const files = listTsFiles(AGENDA_LIB_DIR);

  it("encontrou arquivos para verificar (a guarda nao pode virar um no-op silencioso)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const relative = file.slice(process.cwd().length + 1);
    it(`${relative} nao usa getHours/getDate/getDay/getMonth/getFullYear/setHours`, () => {
      const content = readFileSync(file, "utf8");
      for (const { name, pattern } of FORBIDDEN_PATTERNS) {
        expect(content, `${relative} usa .${name}(), proibido em src/lib/agenda`).not.toMatch(pattern);
      }
    });
  }
});

// Etapas F3a/F3b: os arquivos de periodo/dashboard/insights (F3a) e de
// vencimento/vendas/clientes/caixa (F3b) passaram a usar o fuso da empresa
// (src/lib/time/zoned.ts). A mesma guarda vale para eles, mais um pouco:
// tambem setDate/setMonth/setFullYear, toLocale* (sempre sem timeZone aqui)
// e `new Date(ano, mes, ...)` (construtor local). Comentarios sao ignorados.
const F3A_FILES = [
  "src/lib/finance/period.ts",
  "src/lib/finance/queries.ts",
  "src/lib/finance/dashboardService.ts",
  "src/lib/insights/snapshot.ts",
  "src/lib/insights/queries.ts",
  "src/lib/insights/mutations.ts",
  // F3b
  "src/lib/finance/bills/status.ts",
  "src/lib/finance/bills/queries.ts",
  "src/lib/finance/bills/occurrences.ts",
  "src/lib/finance/bills/materialize.ts",
  "src/lib/finance/cash/queries.ts",
  "src/lib/sales/calculations.ts",
  "src/lib/sales/queries.ts",
  "src/lib/clients/queries.ts",
];
const F3A_FORBIDDEN = [
  ...FORBIDDEN_PATTERNS,
  ...["setDate", "setMonth", "setFullYear", "getTimezoneOffset", "toLocaleString", "toLocaleDateString", "toLocaleTimeString"].map((name) => ({
    name,
    pattern: new RegExp(`\\.${name}\\s*\\(`),
  })),
  { name: "new Date(ano, mes, ...)", pattern: /new Date\(\s*[\w.]+\s*,/ },
  { name: 'new Date("YYYY-MM-DD")', pattern: /new Date\(\s*["'`]/ },
];

describe("arquivos da F3a/F3b nunca usam data/hora local do host", () => {
  for (const relative of F3A_FILES) {
    it(`${relative} nao usa getters/setters locais, toLocale* nem construtor local`, () => {
      const code = readFileSync(join(process.cwd(), relative), "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
      for (const { name, pattern } of F3A_FORBIDDEN) {
        expect(code, `${relative} usa ${name}`).not.toMatch(pattern);
      }
    });
  }
});
