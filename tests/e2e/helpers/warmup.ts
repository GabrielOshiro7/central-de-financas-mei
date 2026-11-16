import { readdirSync } from "node:fs";
import { join } from "node:path";

// Aquecimento do servidor de teste (`next dev`).
//
// No `next dev` cada pagina e cada rota de API so compila na PRIMEIRA requisicao
// (muitos segundos a frio). Sem aquecimento, o teste que cai primeiro numa rota
// paga essa compilacao dentro do proprio tempo limite e falha de forma
// intermitente (a cada execucao, um teste diferente). O aquecimento roda uma vez,
// no globalSetup, depois que o servidor sobe e antes de qualquer teste.
//
// A lista de alvos sai do SISTEMA DE ARQUIVOS (src/app/**/page.tsx e route.ts):
// pagina ou rota nova entra sozinha, sem editar lista nenhuma.

export type WarmupKind = "page" | "api";

export type WarmupTarget = {
  kind: WarmupKind;
  // Caminho da URL ja com os segmentos dinamicos preenchidos (ex.: /agenda/warmup/editar).
  url: string;
  // Dentro do grupo (app): exige sessao (o proxy redireciona quem nao tem cookie ANTES de
  // a pagina compilar, entao sem cookie a pagina nunca compilaria).
  authenticated: boolean;
};

// Valor qualquer para segmentos dinamicos ([id], [token], [...slug]). A pagina ou rota
// pode responder 404/400/500 para ele: o que importa aqui e que ela COMPILOU.
export const WARMUP_DYNAMIC_VALUE = "warmup";

const PAGE_FILE = /^page\.(?:tsx|ts|jsx|js)$/;
const ROUTE_FILE = /^route\.(?:ts|js)$/;

function walk(dir: string, segments: string[], out: WarmupTarget[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // Pasta privada (_x) e rota paralela (@x) nao viram URL.
      if (entry.name.startsWith("_") || entry.name.startsWith("@")) continue;
      walk(join(dir, entry.name), [...segments, entry.name], out);
      continue;
    }
    const kind: WarmupKind | null = PAGE_FILE.test(entry.name) ? "page" : ROUTE_FILE.test(entry.name) ? "api" : null;
    if (!kind) continue;

    const urlSegments = segments
      .filter((s) => !(s.startsWith("(") && s.endsWith(")"))) // grupo de rotas nao entra na URL
      .map((s) => (s.startsWith("[") && s.endsWith("]") ? WARMUP_DYNAMIC_VALUE : s));
    out.push({
      kind,
      url: "/" + urlSegments.join("/"),
      authenticated: kind === "api" || segments.includes("(app)"),
    });
  }
}

export function discoverWarmupTargets(appDir = join(process.cwd(), "src", "app")): WarmupTarget[] {
  const out: WarmupTarget[] = [];
  walk(appDir, [], out);
  return out.sort((a, b) => a.url.localeCompare(b.url) || a.kind.localeCompare(b.kind));
}

export type WarmupResult = { url: string; kind: WarmupKind; status: number; ms: number };

// Quantas requisicoes de aquecimento ao mesmo tempo. O Turbopack compila rotas em
// paralelo; 4 encurta o aquecimento sem transformar o tempo de cada item em ruido.
const CONCURRENCY = 4;
// Tempo limite generoso SO do aquecimento (por item): compilacao a frio.
export const WARMUP_TIMEOUT_MS = 120_000;
// /onboarding so renderiza o assistente para quem ainda NAO terminou o onboarding.
const NOT_ONBOARDED_ONLY = new Set(["/onboarding"]);

async function hit(baseUrl: string, target: WarmupTarget, cookie: string | null): Promise<WarmupResult> {
  const started = Date.now();
  // Corpo consumido ate o fim: a pagina so termina de renderizar (streaming) ali.
  // redirect "manual": a rota que redireciona ja compilou; o destino e um item proprio da lista.
  const res = await fetch(baseUrl + target.url, {
    redirect: "manual",
    headers: cookie ? { cookie } : {},
    signal: AbortSignal.timeout(WARMUP_TIMEOUT_MS),
  });
  const html = await res.text();
  // O servidor compila a PAGINA na requisicao acima, mas o Turbopack tambem compila os chunks de
  // JS/CSS do CLIENTE so quando o navegador os pede. Sem isso, o 1o clique numa navegacao do
  // navegador (ex.: link "Novo agendamento") ainda pagava compilacao a frio. Entao pede-se aqui
  // cada /_next/static/... citado no HTML da pagina.
  if (target.kind === "page" && res.status === 200) {
    for (const asset of clientAssetPaths(html)) {
      const assetRes = await fetch(baseUrl + asset, { signal: AbortSignal.timeout(WARMUP_TIMEOUT_MS) });
      await assetRes.arrayBuffer();
    }
  }
  return { url: target.url, kind: target.kind, status: res.status, ms: Date.now() - started };
}

// Caminhos /_next/static/... (JS e CSS) citados no HTML, sem repeticao.
export function clientAssetPaths(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/\/_next\/static\/[^"'\s<>)\\]+\.(?:js|css)(?:\?[^"'\s<>)\\]*)?/g)) found.add(match[0]);
  return [...found];
}

// Executa o aquecimento. `sessions` traz o cookie de um usuario ja onboarded e o de um sem
// onboarding (so para /onboarding). Registra o tempo de cada item.
export async function runWarmup(
  baseUrl: string,
  sessions: { onboarded: string; fresh: string },
  log: (line: string) => void = console.log
): Promise<WarmupResult[]> {
  const targets = discoverWarmupTargets();
  const results: WarmupResult[] = [];
  let next = 0;

  async function worker() {
    while (next < targets.length) {
      const target = targets[next++];
      const cookie = NOT_ONBOARDED_ONLY.has(target.url) ? sessions.fresh : target.authenticated ? sessions.onboarded : null;
      try {
        const result = await hit(baseUrl, target, cookie);
        results.push(result);
        log(`[warmup] ${String(result.ms).padStart(6)} ms  ${result.status}  ${target.kind === "api" ? "api " : "page"} ${target.url}`);
      } catch (error) {
        throw new Error(`[warmup] ${target.url} nao respondeu em ${WARMUP_TIMEOUT_MS} ms (ou falhou): ${String(error)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results.sort((a, b) => a.url.localeCompare(b.url));
}
