import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    // `next dev` direto, nao `npm run dev`: o script do package.json usa
    // `-H 0.0.0.0` (teste manual pelo celular na rede local), e com essa flag
    // a hidratacao chega bem depois do `load` - os specs clicavam antes dela
    // (ver tests/e2e/helpers/hydration.ts). Os testes so precisam de localhost.
    command: "npx next dev",
    url: "http://localhost:3000",
    // Sempre sobe um processo novo: reaproveitar um servidor ja rodando
    // herdaria o estado em memoria do rate limiter (contagem de tentativas
    // de login/cadastro) de qualquer uso anterior, o que gerou falhas
    // intermitentes e dificeis de diagnosticar nos testes.
    reuseExistingServer: false,
    timeout: 60_000,
    env: { DISABLE_RATE_LIMIT: "1" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
