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

// Etapas F3a/F3b/F3c: os arquivos de periodo/dashboard/insights (F3a), de
// vencimento/vendas/clientes/caixa (F3b) e de importacao/Agenda (F3c) passaram a usar o fuso da empresa
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
  // F3c (importacao e Agenda no fuso da empresa)
  "src/lib/finance/duplicates.ts",
  "src/lib/finance/importParsing.ts",
  "src/lib/finance/importValidation.ts",
  "src/lib/finance/importPreview.ts",
  "src/lib/finance/importConfirm.ts",
  "src/lib/agenda/time.ts",
  "src/lib/agenda/calendar.ts",
  "src/lib/agenda/calculations.ts",
  "src/lib/agenda/queries.ts",
  "src/lib/agenda/mutations.ts",
  "src/lib/agenda/schema.ts",
  // F4 (exibicao no fuso da empresa)
  "src/lib/finance/format.ts",
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

describe("arquivos da F3a/F3b/F3c nunca usam data/hora local do host", () => {
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

// Etapa F4: exibicao e valores iniciais de data no fuso da EMPRESA, nunca no
// do processo (SSR) nem no do navegador (hidratacao/cliente). Toda pagina
// (src/app) e todo componente (src/components) formatam datas so via
// src/lib/time/zoned.ts (formatZonedDate/formatDateKey/formatInstant/
// toDateKey) e recebem "hoje" do servidor por prop. Proibidos aqui: as
// mesmas regras da F3 (getters/setters locais, toLocale*, construtor local,
// new Date("YYYY-MM-DD")) e tambem Intl.DateTimeFormat direto (o fuso
// explicito e responsabilidade do zoned.ts). Arquivos varridos
// recursivamente - arquivo novo entra na guarda sem precisar ser listado.
//
// Excecoes justificadas (caminho relativo -> motivo). Hoje: nenhuma.
const UI_EXCEPTIONS: Record<string, string> = {};
const UI_FORBIDDEN = [
  ...F3A_FORBIDDEN,
  ...["getMinutes", "getSeconds", "setMinutes", "setSeconds"].map((name) => ({ name, pattern: new RegExp(`\\.${name}\\s*\\(`) })),
  { name: "Intl.DateTimeFormat direto", pattern: /Intl\.DateTimeFormat\s*\(/ },
];
const UI_DIRS = ["src/app", "src/components"];

describe("src/app e src/components nunca usam data/hora local do processo/navegador (F4)", () => {
  const files = UI_DIRS.flatMap((dir) => listTsFiles(join(process.cwd(), dir))).map((file) =>
    file.slice(process.cwd().length + 1).replace(/\\/g, "/")
  );

  it("encontrou arquivos para verificar (a guarda nao pode virar um no-op silencioso)", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain("src/components/financeiro/TransactionFormModal.tsx");
    expect(files).toContain("src/app/(app)/dashboard/page.tsx");
  });

  it("toda excecao aponta para um arquivo que existe", () => {
    for (const relative of Object.keys(UI_EXCEPTIONS)) expect(files).toContain(relative);
  });

  for (const relative of files) {
    if (relative in UI_EXCEPTIONS) continue;
    it(`${relative} nao usa getters/setters locais, toLocale*, construtor local nem Intl.DateTimeFormat`, () => {
      const code = readFileSync(join(process.cwd(), relative), "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
      for (const { name, pattern } of UI_FORBIDDEN) {
        expect(code, `${relative} usa ${name}`).not.toMatch(pattern);
      }
    });
  }
});

// Etapa F5: a mesma guarda vale para TODO src/lib, varrido recursivamente
// (substitui na pratica a lista explicita F3A_FILES acima, que fica como
// historico). Desde a F5 nenhuma regra de negocio decide dia/mes/hora com o
// fuso do processo - inclusive o motor de recorrencias
// (src/lib/finance/recurring/occurrences.ts), que passou a operar so em
// DateKey.
//
// Excecoes justificadas (caminho relativo -> motivo).
const LIB_EXCEPTIONS: Record<string, string> = {
  "src/lib/time/zoned.ts":
    "o proprio utilitario: usa Intl.DateTimeFormat com timeZone explicito e Date.UTC/getters UTC - verificado por tests/unit/time/zoned.test.ts",
};

describe("todo src/lib nunca usa data/hora local do processo (F5)", () => {
  const files = listTsFiles(join(process.cwd(), "src", "lib")).map((file) =>
    file.slice(process.cwd().length + 1).replace(/\\/g, "/")
  );

  it("encontrou arquivos para verificar (a guarda nao pode virar um no-op silencioso)", () => {
    expect(files.length).toBeGreaterThan(60);
    expect(files).toContain("src/lib/finance/recurring/occurrences.ts");
    expect(files).toContain("src/lib/finance/bills/occurrences.ts");
    expect(files).toContain("src/lib/finance/period.ts");
    expect(files).toContain("src/lib/agenda/time.ts");
  });

  it("toda excecao aponta para um arquivo que existe", () => {
    for (const relative of Object.keys(LIB_EXCEPTIONS)) expect(files).toContain(relative);
  });

  for (const relative of files) {
    if (relative in LIB_EXCEPTIONS) continue;
    it(`${relative} nao usa getters/setters locais, toLocale*, construtor local nem Intl.DateTimeFormat`, () => {
      const code = readFileSync(join(process.cwd(), relative), "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
      for (const { name, pattern } of UI_FORBIDDEN) {
        expect(code, `${relative} usa ${name}`).not.toMatch(pattern);
      }
    });
  }
});
