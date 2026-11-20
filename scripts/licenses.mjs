// Licencas das dependencias de PRODUCAO (inclui as transitivas), geradas do package-lock.json.
//
//   node scripts/licenses.mjs            -> regenera src/content/legal/thirdPartyLicenses.json
//   node scripts/licenses.mjs --check    -> sai com codigo 1 se o arquivo estiver desatualizado OU houver
//                                           alerta que bloqueia (copyleft forte, ou licenca dupla com
//                                           opcao copyleft sem escolha registrada); imprime os avisos
//   node scripts/licenses.mjs --report   -> imprime o resumo por categoria, as escolhas e os alertas (com quem puxa)
//
// "Producao" = tudo que nao e marcado `dev` nem `devOptional` no lockfile (v3). A licenca vem do
// proprio lockfile; quando ele nao traz, le o package.json instalado (license/licenses); se
// ainda assim nao houver, fica "UNKNOWN" (categoria "desconhecida") - nunca inventada.
// A pagina publica /licencas e o teste tests/unit/thirdPartyLicenses.test.ts leem este arquivo.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const OUTPUT_PATH = join(ROOT, "src", "content", "legal", "thirdPartyLicenses.json");
const LOCK_PATH = join(ROOT, "package-lock.json");

export const CATEGORIES = ["permissiva", "copyleft-fraco", "copyleft-forte", "personalizada", "desconhecida"];

// ESCOLHAS DE LICENCA em pacotes com DUPLA licenca ("A OR B"): o autor deixa o usuario escolher uma
// das duas, e o projeto registra aqui qual USA. Com a escolha registrada, o pacote conta pela licenca
// escolhida (aqui, MIT) e deixa de ser tratado como alerta so por ter uma alternativa GPL na expressao.
//  - `declared`: a expressao EXATA que o lockfile traz hoje. Se uma versao nova mudar a expressao, a
//    escolha deixa de valer sozinha (o pacote volta a ser alerta ate alguem rever a escolha).
//  - `elected`: a licenca escolhida; tem de ser uma das opcoes de `declared`.
export const LICENSE_ELECTIONS = {
  // jszip e puxado pelo exceljs (importacao/modelo de planilha, so no servidor). Licenca declarada:
  // "(MIT OR GPL-3.0-or-later)". O projeto usa o jszip SOB A LICENCA MIT - a opcao GPL nao e usada,
  // entao nao ha obrigacao de GPL sobre o codigo do projeto.
  jszip: {
    declared: "(MIT OR GPL-3.0-or-later)",
    elected: "MIT",
  },
};

// Gravidade para escolher a categoria de uma expressao: maior = mais restritiva.
const RANK = { permissiva: 0, "copyleft-fraco": 1, personalizada: 2, desconhecida: 3, "copyleft-forte": 4 };

const PERMISSIVE = /^(MIT|MIT\/X11|X11|ISC|0BSD|BSD(-\d-Clause)?(-Clear)?|Apache-2\.0|Apache-1\.1|Unlicense|CC0-1\.0|CC-BY-[\d.]+|Zlib|BlueOak-1\.0\.0|Python-2\.0|OFL-1\.1|WTFPL|Artistic-2\.0)$/i;
const WEAK = /^(LGPL-[\d.]+(-only|-or-later)?|MPL-[\d.]+|EPL-[\d.]+|CDDL-[\d.]+|CPL-1\.0)$/i;
const STRONG = /^(GPL-[\d.]+(-only|-or-later)?|AGPL-[\d.]+(-only|-or-later)?|SSPL-1\.0|EUPL-[\d.]+)$/i;

function classifyToken(token) {
  const t = token.trim().replace(/\+$/, "");
  if (PERMISSIVE.test(t)) return "permissiva";
  if (WEAK.test(t)) return "copyleft-fraco";
  if (STRONG.test(t)) return "copyleft-forte";
  return "personalizada";
}

// Classifica uma expressao SPDX simples ("A AND B", "(A OR B)"). AND = vale a mais restritiva;
// OR = o usuario escolhe, vale a menos restritiva (e `dual: true` avisa que ha alternativa
// mais restritiva - copyleft -, para constar do relatorio).
export function classifyLicense(license) {
  if (!license || license === "UNKNOWN") return { category: "desconhecida", dual: false };
  const text = String(license).trim();
  // Textos livres (nao SPDX): "SEE LICENSE AT ...", "Standard 'no charge' license: ..." => personalizada.
  if (/[:/ ]/.test(text) && !/\b(AND|OR)\b/.test(text) && !/^[\w.+-]+(\/[\w.+-]+)?$/.test(text)) {
    return { category: "personalizada", dual: false };
  }
  const orParts = text.replace(/[()]/g, "").split(/\s+OR\s+/);
  let dual = false;
  const orCategories = orParts.map((part) => {
    const andCategories = part.split(/\s+AND\s+/).map(classifyToken);
    return andCategories.reduce((worst, c) => (RANK[c] > RANK[worst] ? c : worst), "permissiva");
  });
  if (orParts.length > 1) {
    const best = orCategories.reduce((lowest, c) => (RANK[c] < RANK[lowest] ? c : lowest));
    dual = orCategories.some((c) => RANK[c] > RANK[best]);
    return { category: best, dual };
  }
  return { category: orCategories[0], dual };
}

// A escolha registrada vale para este pacote? So se a expressao do lockfile e exatamente a declarada
// e a licenca escolhida e uma das opcoes dela.
export function validElection(name, license, elections = LICENSE_ELECTIONS) {
  const election = elections[name];
  if (!election || election.declared !== license) return null;
  const options = String(license).replace(/[()]/g, "").split(/\s+OR\s+/).map((o) => o.trim());
  return options.includes(election.elected) ? election : null;
}

// Categoria do pacote: pela licenca ESCOLHIDA, se houver escolha valida; senao pela expressao inteira.
export function classifyPackage(name, license, elections = LICENSE_ELECTIONS) {
  const election = validElection(name, license, elections);
  if (election) return { category: classifyLicense(election.elected).category, dual: false, elected: election.elected };
  return { ...classifyLicense(license), elected: null };
}

function installedLicense(root, lockPath) {
  const file = join(root, lockPath, "package.json");
  if (!existsSync(file)) return null;
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license && typeof pkg.license.type === "string") return pkg.license.type;
  if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
    return pkg.licenses.map((l) => (typeof l === "string" ? l : l.type)).filter(Boolean).join(" OR ");
  }
  return null;
}

function nameFromPath(lockPath) {
  return lockPath.replace(/^.*node_modules\//, "");
}

// Pacotes de producao do lockfile, sem repeticao de nome@versao, em ordem alfabetica.
export function collectProductionPackages(lock, root = ROOT, elections = LICENSE_ELECTIONS) {
  const seen = new Map();
  for (const [lockPath, entry] of Object.entries(lock.packages ?? {})) {
    if (lockPath === "" || entry.dev || entry.devOptional) continue;
    const name = entry.name ?? nameFromPath(lockPath);
    const key = `${name}@${entry.version}`;
    if (seen.has(key)) continue;
    const license = entry.license ?? installedLicense(root, lockPath) ?? "UNKNOWN";
    const { category, elected } = classifyPackage(name, license, elections);
    seen.set(key, { name, version: entry.version, license, ...(elected ? { elected } : {}), category });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

export function fingerprint(packages) {
  const text = packages.map((p) => `${p.name}@${p.version}=${p.license}${p.elected ? `=>${p.elected}` : ""}`).join("\n");
  return createHash("sha256").update(text).digest("hex");
}

export function buildLicenseFile(lock, root = ROOT, elections = LICENSE_ELECTIONS) {
  const packages = collectProductionPackages(lock, root, elections);
  return {
    source: "package-lock.json (dependências de produção, incluindo as transitivas)",
    lockfileVersion: lock.lockfileVersion,
    fingerprint: fingerprint(packages),
    packages,
  };
}

export function readLock() {
  return JSON.parse(readFileSync(LOCK_PATH, "utf8"));
}

export function countByCategory(packages) {
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const p of packages) counts[p.category] += 1;
  return counts;
}

// Alertas da lista. BLOQUEIAM o `--check`: copyleft forte (GPL/AGPL) e licenca dupla com opcao copyleft SEM
// escolha registrada em LICENSE_ELECTIONS. Apenas AVISAM: copyleft fraco, licenca propria do autor e sem licenca.
export function findAlerts(packages) {
  const blocking = [];
  const warnings = [];
  for (const p of packages) {
    const label = `${p.name}@${p.version} (${p.license})`;
    const { dual } = p.elected ? { dual: false } : classifyLicense(p.license);
    if (p.category === "copyleft-forte") blocking.push({ kind: "copyleft-forte", name: p.name, label });
    else if (dual) blocking.push({ kind: "dupla-sem-escolha", name: p.name, label });
    else if (p.category === "desconhecida") warnings.push({ kind: "desconhecida", name: p.name, label });
    else if (p.category === "personalizada") warnings.push({ kind: "personalizada", name: p.name, label });
    else if (p.category === "copyleft-fraco") warnings.push({ kind: "copyleft-fraco", name: p.name, label });
  }
  return { blocking, warnings };
}

// Quem puxa cada pacote (dependencies/optionalDependencies/peerDependencies de outros pacotes de producao).
export function requiredBy(lock, name) {
  const by = new Set();
  for (const [lockPath, entry] of Object.entries(lock.packages ?? {})) {
    if (entry.dev || entry.devOptional) continue;
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      if (entry[field] && entry[field][name]) by.add(lockPath === "" ? "(projeto)" : nameFromPath(lockPath));
    }
  }
  return [...by].sort();
}

function printAlerts(lock, packages) {
  const { blocking, warnings } = findAlerts(packages);
  for (const a of blocking) console.log(`BLOQUEIA  ${a.kind}\t${a.label}\t<- ${requiredBy(lock, a.name).join(", ")}`);
  for (const a of warnings) console.log(`aviso     ${a.kind}\t${a.label}\t<- ${requiredBy(lock, a.name).join(", ")}`);
  return { blocking, warnings };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const mode = process.argv[2] ?? "";
  const lock = readLock();
  const fresh = buildLicenseFile(lock);
  const serialized = `${JSON.stringify(fresh, null, 2)}\n`;

  if (mode === "--check") {
    const current = existsSync(OUTPUT_PATH) ? readFileSync(OUTPUT_PATH, "utf8").replace(/\r\n/g, "\n") : "";
    if (current !== serialized) {
      console.error("thirdPartyLicenses.json está desatualizado em relação ao package-lock.json. Rode: npm run licenses:generate");
      process.exit(1);
    }
    const { blocking, warnings } = printAlerts(lock, fresh.packages);
    if (blocking.length > 0) {
      console.error(`FALHOU: ${blocking.length} alerta(s) que bloqueiam (copyleft forte ou licença dupla sem escolha registrada em LICENSE_ELECTIONS).`);
      process.exit(1);
    }
    console.log(`ok: ${fresh.packages.length} pacotes, lista em dia com o package-lock.json; 0 alertas que bloqueiam, ${warnings.length} aviso(s) (não bloqueiam)`);
  } else if (mode === "--report") {
    console.log(JSON.stringify(countByCategory(fresh.packages), null, 2));
    for (const p of fresh.packages) if (p.elected) console.log(`escolha    ${p.name}@${p.version}\t${p.license} => usado sob ${p.elected}`);
    printAlerts(lock, fresh.packages);
  } else {
    writeFileSync(OUTPUT_PATH, serialized);
    console.log(`gerado: ${fresh.packages.length} pacotes -> ${OUTPUT_PATH}`);
  }
}
