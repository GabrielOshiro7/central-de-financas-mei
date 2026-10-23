import { config } from "dotenv";

// Ambiente dos testes (Vitest e Playwright). Carrega .env.test primeiro e o
// .env depois so como fallback das demais variaveis (APP_URL etc.) - nunca
// com override: uma variavel ja definida no shell vence, e por isso a trava
// abaixo tambem cobre um DATABASE_URL errado passado na linha de comando.
export function loadTestEnv() {
  config({ path: ".env.test", quiet: true });
  config({ path: ".env", quiet: true });
}

// Trava de seguranca: os testes criam e apagam dados livremente, entao so
// podem rodar contra um banco cujo nome termina em "_test" - nunca contra o
// app_db de desenvolvimento. Chamada antes de qualquer conexao com o banco.
export function assertTestDatabase(url: string | undefined = process.env.DATABASE_URL): string {
  let databaseName = "";
  try {
    databaseName = url ? decodeURIComponent(new URL(url).pathname.replace(/^\//, "")) : "";
  } catch {
    databaseName = "";
  }

  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `[testes] ABORTADO: DATABASE_URL aponta para o banco "${databaseName || "(nenhum)"}", ` +
        `que não termina em "_test". Os testes só rodam contra o banco de teste ` +
        `(crie .env.test a partir de .env.test.example e rode \`npm run test:db:prepare\`).`
    );
  }

  return databaseName;
}
