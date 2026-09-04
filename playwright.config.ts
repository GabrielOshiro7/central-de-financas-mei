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
    command: "npm run dev",
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
