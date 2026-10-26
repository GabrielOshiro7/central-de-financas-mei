import { defineConfig, devices } from "@playwright/test";
import { assertTestDatabase, loadTestEnv } from "./tests/testEnv";

// Banco e porta proprios dos testes, nunca os do `npm run dev`: o app_db de
// desenvolvimento e a porta 3000 continuam intocados enquanto a suite roda.
// A trava aborta aqui, antes de o webServer subir, se o DATABASE_URL efetivo
// nao for um banco "_test" (repetida em tests/e2e/global-setup.ts).
loadTestEnv();
assertTestDatabase();

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    // `next dev` direto, nao `npm run dev`: o script do package.json usa
    // `-H 0.0.0.0` (teste manual pelo celular na rede local), e com essa flag
    // a hidratacao chega bem depois do `load` - os specs clicavam antes dela
    // (ver tests/e2e/helpers/hydration.ts). Os testes so precisam de localhost.
    command: `npx next dev -p ${PORT}`,
    url: BASE_URL,
    // Sempre sobe um processo novo: reaproveitar um servidor ja rodando
    // herdaria o estado em memoria do rate limiter (contagem de tentativas
    // de login/cadastro) de qualquer uso anterior, o que gerou falhas
    // intermitentes e dificeis de diagnosticar nos testes.
    reuseExistingServer: false,
    // Compilacao a frio do `next dev` (pasta .next-test vazia): 23,6 s medidos
    // com a maquina ociosa, e ja passou de 60 s sob carga (F3b). 180 s da folga.
    timeout: 180_000,
    env: {
      DISABLE_RATE_LIMIT: "1",
      // Explicitos: variaveis do processo vencem o .env que o `next dev` le.
      DATABASE_URL: process.env.DATABASE_URL!,
      APP_URL: BASE_URL,
      // Pasta de build propria: o Next 16 trava um segundo `next dev` no
      // mesmo diretorio (.next/dev/lock), entao sem isso o servidor de teste
      // nao subiria com o `npm run dev` do usuario aberto (ver next.config.ts).
      NEXT_DIST_DIR: ".next-test",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
