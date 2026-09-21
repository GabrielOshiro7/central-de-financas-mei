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
