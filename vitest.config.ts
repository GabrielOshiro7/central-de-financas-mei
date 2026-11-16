import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Ambiente padrao continua "node" (a maioria dos testes e calculo puro
    // ou integracao com o banco - nao precisam de DOM). Testes de componente
    // (.test.tsx) usam a diretiva `// @vitest-environment jsdom` no topo do
    // proprio arquivo pra rodar em jsdom so onde precisam, sem afetar os
    // demais.
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    // Um processo por fuso (UTC/New York/Tokyo) para os testes de idempotencia dos recorrentes,
    // subido uma vez antes dos arquivos de teste.
    globalSetup: ["./tests/globalSetup/timeZoneWorkers.ts"],
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
    ],
  },
});
