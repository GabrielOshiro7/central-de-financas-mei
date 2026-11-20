import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
// Gerador e verificador de licencas (scripts/licenses.mjs): a pagina publica /licencas le o arquivo
// que ele gera. Aqui se garante que a lista (a) e regeneravel, (b) nao esta desatualizada em relacao
// ao package-lock.json, (c) esta classificada corretamente e (d) so alerta o que realmente e alerta.
import {
  LICENSE_ELECTIONS,
  buildLicenseFile,
  classifyLicense,
  classifyPackage,
  collectProductionPackages,
  countByCategory,
  findAlerts,
  fingerprint,
  OUTPUT_PATH,
  readLock,
  validElection,
} from "../../scripts/licenses.mjs";
import { compareVersions } from "@/lib/legal/acceptance";

type Entry = { name: string; version: string; license: string; elected?: string; category: string };
type LicenseFile = { source: string; lockfileVersion: number; fingerprint: string; packages: Entry[] };

const stored = (): LicenseFile => JSON.parse(readFileSync(OUTPUT_PATH, "utf8"));
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("classifyLicense", () => {
  it("licenças permissivas", () => {
    for (const license of ["MIT", "BSD-3-Clause", "Apache-2.0", "ISC", "0BSD", "Unlicense", "CC-BY-4.0", "MIT/X11", "OFL-1.1", "(MIT AND Zlib)"]) {
      expect(classifyLicense(license).category, license).toBe("permissiva");
    }
  });
  it("copyleft fraco (LGPL, MPL)", () => {
    expect(classifyLicense("LGPL-3.0-or-later").category).toBe("copyleft-fraco");
    expect(classifyLicense("MPL-2.0").category).toBe("copyleft-fraco");
  });
  it("copyleft forte (GPL, AGPL)", () => {
    expect(classifyLicense("GPL-3.0-only").category).toBe("copyleft-forte");
    expect(classifyLicense("AGPL-3.0-or-later").category).toBe("copyleft-forte");
  });
  it("AND vale a mais restritiva; OR vale a menos restritiva e marca a alternativa copyleft como dual", () => {
    expect(classifyLicense("Apache-2.0 AND LGPL-3.0-or-later AND MIT").category).toBe("copyleft-fraco");
    expect(classifyLicense("MIT AND GPL-3.0-only").category).toBe("copyleft-forte");
    expect(classifyLicense("(MIT OR GPL-3.0-or-later)")).toEqual({ category: "permissiva", dual: true });
    expect(classifyLicense("GPL-3.0-only OR AGPL-3.0-only").category).toBe("copyleft-forte");
  });
  it("licença própria do autor e licença ausente", () => {
    expect(classifyLicense("SEE LICENSE AT https://gsap.com/standard-license").category).toBe("personalizada");
    expect(classifyLicense("Standard 'no charge' license: https://gsap.com/standard-license.").category).toBe("personalizada");
    expect(classifyLicense("UNKNOWN").category).toBe("desconhecida");
    expect(classifyLicense(null).category).toBe("desconhecida");
  });
});

describe("escolha de licença em pacote com dupla licença (jszip sob MIT)", () => {
  const DUAL = "(MIT OR GPL-3.0-or-later)";

  it("o jszip está registrado como usado sob MIT, com a expressão exata do lockfile", () => {
    expect(LICENSE_ELECTIONS.jszip).toEqual({ declared: DUAL, elected: "MIT" });
  });

  it("a escolha vale só se a expressão do lockfile for exatamente a declarada e a licença escolhida for uma das opções", () => {
    expect(validElection("jszip", DUAL)?.elected).toBe("MIT");
    expect(validElection("jszip", "(MIT OR GPL-3.0-only)")).toBeNull(); // expressão mudou: a escolha perde a validade
    expect(validElection("outro-pacote", DUAL)).toBeNull(); // sem escolha registrada
    const wrongChoice = { x: { declared: DUAL, elected: "Apache-2.0" } } as unknown as typeof LICENSE_ELECTIONS;
    expect(validElection("x", DUAL, wrongChoice)).toBeNull(); // escolhida não é opção da expressão
  });

  it("com a escolha, o pacote conta como MIT (permissiva) e deixa de ser dual; sem ela, continua dual", () => {
    expect(classifyPackage("jszip", DUAL)).toEqual({ category: "permissiva", dual: false, elected: "MIT" });
    expect(classifyPackage("outro-pacote", DUAL)).toEqual({ category: "permissiva", dual: true, elected: null });
  });

  it("findAlerts: licença dupla com opção GPL SEM escolha BLOQUEIA; COM escolha não alerta", () => {
    const base = { name: "pacote", version: "1.0.0", license: DUAL, category: "permissiva" };
    expect(findAlerts([base]).blocking.map((a) => a.kind)).toEqual(["dupla-sem-escolha"]);
    expect(findAlerts([{ ...base, elected: "MIT" }])).toEqual({ blocking: [], warnings: [] });
  });

  it("findAlerts: GPL/AGPL bloqueia; LGPL, licença própria e sem licença só avisam", () => {
    const mk = (license: string) => {
      const { category } = classifyLicense(license);
      return { name: "p", version: "1.0.0", license, category };
    };
    expect(findAlerts([mk("GPL-3.0-only")]).blocking.map((a) => a.kind)).toEqual(["copyleft-forte"]);
    expect(findAlerts([mk("AGPL-3.0-or-later")]).blocking.map((a) => a.kind)).toEqual(["copyleft-forte"]);
    expect(findAlerts([mk("LGPL-3.0-or-later")])).toMatchObject({ blocking: [], warnings: [{ kind: "copyleft-fraco" }] });
    expect(findAlerts([mk("SEE LICENSE AT https://x.example")])).toMatchObject({ blocking: [], warnings: [{ kind: "personalizada" }] });
    expect(findAlerts([mk("UNKNOWN")])).toMatchObject({ blocking: [], warnings: [{ kind: "desconhecida" }] });
  });

  it("o gerador explica a escolha em comentário (qual pacote, qual licença e por quê)", () => {
    const source = read("scripts/licenses.mjs");
    expect(source).toMatch(/ESCOLHAS DE LICENCA em pacotes com DUPLA licenca/);
    expect(source).toMatch(/jszip e puxado pelo exceljs/);
    expect(source).toMatch(/SOB A LICENCA MIT/);
  });
});

describe("lista de licenças x package-lock.json", () => {
  const lock = readLock();

  it("é REGENERÁVEL: gerar de novo produz exatamente o arquivo versionado (senão: npm run licenses:generate)", () => {
    expect(buildLicenseFile(lock)).toEqual(stored());
  });

  it("não fica desatualizada: todo pacote de produção do lockfile está na lista, com a mesma versão", () => {
    const listed = new Set(stored().packages.map((p) => `${p.name}@${p.version}`));
    const expected = collectProductionPackages(lock).map((p: Entry) => `${p.name}@${p.version}`);
    const missing = expected.filter((key: string) => !listed.has(key));
    expect(missing, `Faltam na lista (rode npm run licenses:generate): ${missing.join(", ")}`).toEqual([]);
    expect(stored().packages.length).toBe(expected.length);
  });

  it("não lista pacotes só de desenvolvimento", () => {
    const devOnly = Object.entries(lock.packages as Record<string, { dev?: boolean; devOptional?: boolean; version: string }>)
      .filter(([path, e]) => path !== "" && (e.dev || e.devOptional))
      .map(([path, e]) => `${path.replace(/^.*node_modules\//, "")}@${e.version}`);
    const prodKeys = new Set(collectProductionPackages(lock).map((p: Entry) => `${p.name}@${p.version}`));
    const listed = stored().packages.map((p) => `${p.name}@${p.version}`);
    // Um pacote pode existir em duas versoes (uma de producao, outra de dev): so conta se a versao de dev nao e de producao.
    const leaked = listed.filter((key) => devOnly.includes(key) && !prodKeys.has(key));
    expect(leaked).toEqual([]);
  });

  it("as dependências diretas de produção do package.json estão na lista", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    const names = new Set(stored().packages.map((p) => p.name));
    for (const dep of Object.keys(pkg.dependencies)) expect(names.has(dep), dep).toBe(true);
  });

  it("a impressão digital confere e a contagem por categoria soma o total", () => {
    const file = stored();
    expect(file.fingerprint).toBe(fingerprint(file.packages));
    const counts = countByCategory(file.packages) as Record<string, number>;
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(file.packages.length);
  });

  it("cada entrada tem nome, versão e licença, e a categoria bate com a licença (ou com a escolha registrada)", () => {
    for (const p of stored().packages) {
      expect(p.name && p.version && p.license, JSON.stringify(p)).toBeTruthy();
      expect(p.category).toBe(classifyPackage(p.name, p.license).category);
    }
  });

  it("jszip: entrada da lista usa a escolha MIT e conta como permissiva", () => {
    const jszip = stored().packages.find((p) => p.name === "jszip")!;
    expect(jszip).toMatchObject({ license: "(MIT OR GPL-3.0-or-later)", elected: "MIT", category: "permissiva" });
  });

  it("ALERTA DE PARADA: nenhum copyleft forte e nenhuma licença dupla sem escolha registrada; jszip NÃO é alerta", () => {
    const { blocking, warnings } = findAlerts(stored().packages);
    expect(blocking.map((a) => `${a.kind} ${a.label}`)).toEqual([]);
    expect([...blocking, ...warnings].some((a) => a.name === "jszip")).toBe(false);
  });

  it("avisos que continuam (não bloqueiam): sem licença declarada (buffers), licença própria (GSAP) e LGPL do sharp", () => {
    const { warnings } = findAlerts(stored().packages);
    const kinds = (name: string) => warnings.filter((w) => w.name === name).map((w) => w.kind);
    expect(kinds("buffers")).toEqual(["desconhecida"]);
    expect(kinds("gsap")).toEqual(["personalizada"]);
    expect(kinds("@gsap/react")).toEqual(["personalizada"]);
    expect(warnings.some((w) => w.kind === "copyleft-fraco" && w.name.startsWith("@img/sharp"))).toBe(true);
  });

  it("licenses:check roda de verdade (node scripts/licenses.mjs --check): código 0 e 0 alertas que bloqueiam", () => {
    const run = spawnSync(process.execPath, ["scripts/licenses.mjs", "--check"], { cwd: process.cwd(), encoding: "utf8" });
    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(run.stdout).toMatch(/0 alertas que bloqueiam/);
    expect(run.stdout).not.toMatch(/BLOQUEIA/);
    expect(run.stdout).not.toMatch(/jszip/);
  });
});

describe("GSAP: versão e licença registrada", () => {
  const lock = readLock() as { packages: Record<string, { version: string }> };

  it("gsap e @gsap/react estão na versão em que a licença gratuita vale (gsap >= 3.13.0); se cair abaixo, ALERTA, sem atualizar sozinho", () => {
    const gsap = lock.packages["node_modules/gsap"].version;
    const react = lock.packages["node_modules/@gsap/react"].version;
    expect(compareVersions(gsap, "3.13.0"), `gsap ${gsap} é menor que 3.13.0: reporte, não atualize sem decisão`).toBeGreaterThanOrEqual(0);
    expect(react).toBeTruthy();
  });

  it("a página /licencas registra a Standard No Charge GSAP License com o link oficial", () => {
    const page = read("src/app/licencas/page.tsx");
    expect(page).toContain('"Standard No Charge GSAP License"');
    expect(page).toContain('"https://gsap.com/standard-license"');
  });
});
