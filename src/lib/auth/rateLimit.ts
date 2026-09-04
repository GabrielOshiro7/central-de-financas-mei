// Rate limiter em memoria por janela fixa (fixed window).
// Funciona bem para uma unica instancia do processo. Se a aplicacao escalar
// para multiplas instancias, este estado deve migrar para algo compartilhado
// (ex.: Redis/Upstash), pois cada instancia teria seu proprio contador aqui.

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

// Evita crescimento ilimitado do Map em processos de longa duracao.
function cleanupExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

let lastCleanup = 0;
const CLEANUP_INTERVAL_MS = 60_000;

export type RateLimitResult = {
  allowed: boolean;
  retryAfterMs: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  // Usado apenas pelo servidor dev que a suite E2E sobe (ver
  // playwright.config.ts) - os testes rodam do mesmo IP em sequencia rapida
  // e esbarrariam no limite real. Nunca definido em desenvolvimento/producao.
  if (process.env.DISABLE_RATE_LIMIT === "1") {
    return { allowed: true, retryAfterMs: 0 };
  }

  const now = Date.now();

  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    cleanupExpired(now);
    lastCleanup = now;
  }

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}
