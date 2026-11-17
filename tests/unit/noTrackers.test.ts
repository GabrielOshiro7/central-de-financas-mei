import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// TRAVA CONTRA RASTREAMENTO.
//
// O sistema NAO usa analise de acesso, publicidade, pixels, mapas de calor, gravacao de sessao nem
// qualquer outro script de rastreamento - e e isso que a Politica de Privacidade, a pagina de Cookies
// e o aviso de cookies afirmam ("nao usamos cookies de analise ou de publicidade"). Este teste FALHA
// se aparecer no codigo-fonte, no package.json/lockfile ou nos arquivos de configuracao qualquer
// referencia a um rastreador conhecido (pacote, dominio ou chamada global).
//
// SE UM TESTE ABAIXO FALHAR, NAO "CONSERTE" REMOVENDO A ENTRADA DA LISTA. Adicionar um rastreador de
// verdade exige, ANTES de mexer no codigo:
//   1. revisar a Politica de Privacidade (src/content/legal/privacy.ts): secao de envio a terceiros,
//      finalidades e a lista de provedores;
//   2. revisar a pagina de Cookies e o aviso de cookies (hoje so informativo, SEM consentimento);
//   3. decidir se e preciso CONSENTIMENTO previo (LGPD / APPI / regras de cookies) e so carregar o
//      script depois do aceite;
//   4. atualizar a CSP (src/lib/security/headers.ts: script-src, connect-src, img-src) e o teste de
//      "nenhuma requisicao externa" (tests/e2e/noExternalRequests.spec.ts);
//   5. ter a aprovacao do responsavel pelo produto.
// So entao a entrada pode sair daqui, no mesmo commit, com a justificativa.

// Pacotes npm de rastreamento / monitoramento com captura de usuario. Termina em "/" = escopo inteiro.
export const TRACKER_PACKAGES: string[] = [
  "@next/third-parties", // wrappers oficiais de GTM, GA, YouTube, Maps...
  "@vercel/analytics",
  "@vercel/speed-insights",
  "react-ga",
  "react-ga4",
  "ga-gtag",
  "universal-analytics",
  "react-gtm-module",
  "react-facebook-pixel",
  "react-pixel",
  "@sentry/", // inclui replay (gravacao de sessao)
  "sentry",
  "mixpanel",
  "mixpanel-browser",
  "posthog-js",
  "posthog-node",
  "amplitude-js",
  "@amplitude/",
  "analytics-node",
  "@segment/",
  "@rudderstack/",
  "rudder-sdk-js",
  "hotjar",
  "@hotjar/",
  "react-hotjar",
  "@microsoft/clarity",
  "clarity-js",
  "logrocket",
  "@logrocket/",
  "@fullstory/",
  "@datadog/browser-rum",
  "@datadog/browser-logs",
  "newrelic",
  "@newrelic/",
  "bugsnag-js",
  "@bugsnag/",
  "rollbar",
  "raygun4js",
  "@highlight-run/",
  "@openreplay/",
  "smartlook-client",
  "mouseflow",
  "heap-api",
  "@heap/",
  "plausible-tracker",
  "next-plausible",
  "@statsig/",
  "launchdarkly-js-client-sdk",
  "@intercom/",
  "react-intercom",
  "@hubspot/",
  "tiktok-pixel",
];

// Dominios de rastreamento (casam sem casar dentro de outro nome: "cheap.io" nao e "heap.io").
export const TRACKER_DOMAINS: string[] = [
  "googletagmanager.com",
  "google-analytics.com",
  "analytics.google.com",
  "googleadservices.com",
  "googlesyndication.com",
  "doubleclick.net",
  "connect.facebook.net",
  "facebook.com/tr",
  "hotjar.com",
  "hotjar.io",
  "clarity.ms",
  "segment.com",
  "segment.io",
  "mixpanel.com",
  "sentry.io",
  "plausible.io",
  "posthog.com",
  "amplitude.com",
  "heapanalytics.com",
  "fullstory.com",
  "logrocket.com",
  "logrocket.io",
  "intercom.io",
  "intercomcdn.com",
  "hs-scripts.com",
  "hs-analytics.net",
  "hsforms.net",
  "analytics.tiktok.com",
  "snap.licdn.com",
  "px.ads.linkedin.com",
  "static.ads-twitter.com",
  "analytics.twitter.com",
  "datadoghq.com",
  "newrelic.com",
  "nr-data.net",
  "vercel-insights.com",
  "vercel-scripts.com",
  "umami.is",
  "matomo.cloud",
  "piwik.pro",
  "statcounter.com",
  "crazyegg.com",
  "mouseflow.com",
  "smartlook.com",
  "pendo.io",
  "rudderstack.com",
  "bugsnag.com",
  "rollbar.com",
  "raygun.io",
  "appsignal.com",
  "highlight.io",
  "openreplay.com",
  "clicky.com",
  "cloudflareinsights.com",
  "mc.yandex.ru",
  "hm.baidu.com",
];

// Chamadas/globais tipicas dos snippets de rastreamento.
export const TRACKER_CALLS: RegExp[] = [
  /\bgtag\s*\(/,
  /\bfbq\s*\(/,
  /\bdataLayer\b/,
  /\b_gaq\b/,
  /\b_paq\b/,
  /\b_hsq\b/,
  /\bwindow\.ga\s*\(/,
  /\bhj\s*\(\s*['"]/,
  /\bclarity\s*\(\s*['"]/,
  /\bmixpanel\.(init|track)\b/,
  /\bposthog\.(init|capture)\b/,
  /\banalytics\.(track|identify|page)\s*\(/,
  /\bSentry\.init\b/,
  /\bLogRocket\.init\b/,
  /\bnavigator\.sendBeacon\s*\(/, // beacon de telemetria: qualquer uso exige revisao
];

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const domainRegex = (domain: string) => new RegExp(`(?<![a-z0-9-])${escapeRegex(domain)}`, "i");

export function findTrackerReferences(text: string): string[] {
  const found: string[] = [];
  for (const domain of TRACKER_DOMAINS) if (domainRegex(domain).test(text)) found.push(`dominio ${domain}`);
  for (const call of TRACKER_CALLS) if (call.test(text)) found.push(`chamada ${call.source}`);
  return found;
}

export function isTrackerPackage(name: string): boolean {
  return TRACKER_PACKAGES.some((entry) => (entry.endsWith("/") ? name.startsWith(entry) : name === entry));
}

const SCANNED_EXTENSIONS = /\.(tsx?|jsx?|mjs|cjs|css|html?|json|svg|md|mdx|txt|ya?ml)$/i;
const root = process.cwd();
const BACKSLASH = String.fromCharCode(92);
const normalize = (p: string) => p.split(BACKSLASH).join("/");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return SCANNED_EXTENSIONS.test(entry.name) ? [full] : [];
  });
}

function sourceFiles(): string[] {
  const dirs = ["src", "public"].map((d) => join(root, d)).filter((d) => existsSync(d));
  const rootFiles = ["next.config.ts", "next.config.js", "next.config.mjs", "package.json", "vercel.json"]
    .map((f) => join(root, f))
    .filter((f) => existsSync(f) && statSync(f).isFile());
  return [...dirs.flatMap(walk), ...rootFiles];
}

describe("detector (a trava enxerga os rastreadores conhecidos)", () => {
  it("acha domínios, chamadas globais e pacotes de rastreamento", () => {
    expect(findTrackerReferences('<script src="https://www.googletagmanager.com/gtm.js?id=GTM-X"></script>')).toContain("dominio googletagmanager.com");
    expect(findTrackerReferences("fbq('init', '123')")).toHaveLength(1);
    expect(findTrackerReferences("window.dataLayer = []")).toHaveLength(1);
    expect(findTrackerReferences("https://o123.ingest.sentry.io/456")).toContain("dominio sentry.io");
    expect(findTrackerReferences("navigator.sendBeacon('/x', data)")).toHaveLength(1);
    expect(isTrackerPackage("@sentry/nextjs")).toBe(true);
    expect(isTrackerPackage("@vercel/analytics")).toBe(true);
    expect(isTrackerPackage("posthog-js")).toBe(true);
  });

  it("não dá falso positivo em texto comum (scrollbar, amplitude, cheap.io, nomes parecidos)", () => {
    expect(findTrackerReferences("scrollbar-width: none; .x::-webkit-scrollbar { }")).toEqual([]);
    expect(findTrackerReferences("amplitude: 16 // translateY em px")).toEqual([]);
    expect(findTrackerReferences("https://cheap.io/ e notsentry.io.example.com")).toEqual([]);
    expect(isTrackerPackage("zod")).toBe(false);
    expect(isTrackerPackage("@prisma/client")).toBe(false);
    expect(isTrackerPackage("sentry-lookalike")).toBe(false);
  });
});

describe("o projeto não tem rastreamento", () => {
  it("o varredor lê o código-fonte de verdade (sanidade)", () => {
    const files = sourceFiles().map(normalize);
    expect(files.length).toBeGreaterThan(150);
    expect(files.some((f) => f.endsWith("/package.json"))).toBe(true);
    expect(files.some((f) => f.endsWith("src/proxy.ts"))).toBe(true);
  });

  it("package.json: nenhuma dependência (de produção, de desenvolvimento ou opcional) é de rastreamento", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
    const names = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].flatMap((k) => Object.keys(pkg[k] ?? {}));
    expect(names.length).toBeGreaterThan(10);
    expect(names.filter(isTrackerPackage)).toEqual([]);
  });

  it("package-lock.json: nenhum pacote instalado (nem transitivo) é de rastreamento", () => {
    const lockPath = join(root, "package-lock.json");
    if (!existsSync(lockPath)) return;
    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { packages?: Record<string, unknown> };
    const names = Object.keys(lock.packages ?? {})
      .filter((k) => k.includes("node_modules/"))
      .map((k) => k.slice(k.lastIndexOf("node_modules/") + "node_modules/".length));
    expect(names.length).toBeGreaterThan(100);
    expect(names.filter(isTrackerPackage)).toEqual([]);
  });

  it("código-fonte, configuração e arquivos públicos: nenhum domínio, chamada global ou import de rastreamento", () => {
    const hits: string[] = [];
    for (const file of sourceFiles()) {
      const text = readFileSync(file, "utf8");
      const shown = normalize(file.slice(root.length + 1));
      for (const reference of findTrackerReferences(text)) hits.push(`${shown}: ${reference}`);
      // import x from "pkg" / import("pkg") / import "pkg" (efeito colateral) / require("pkg")
      for (const match of text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)["']([^"']+)["']/g)) {
        if (isTrackerPackage(match[1])) hits.push(`${shown}: import ${match[1]}`);
      }
    }
    expect(hits, "referencia a rastreador - leia o cabecalho deste arquivo antes de continuar").toEqual([]);
  });
});
