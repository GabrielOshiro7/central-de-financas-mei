import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { assertTestDatabase, loadTestEnv } from "../testEnv";

// `npm run test:db:prepare`: cria o banco de teste (se ainda nao existir) no
// mesmo Postgres do docker-compose, aplica as migracoes com
// `prisma migrate deploy` (nunca migrate dev/reset) e roda o seed - sempre
// com o DATABASE_URL do teste explicito no ambiente do processo filho.
async function main() {
  loadTestEnv();
  const url = process.env.DATABASE_URL!;
  const databaseName = assertTestDatabase(url);

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  adminUrl.search = "";
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${databaseName.replaceAll('"', '""')}"`);
      console.log(`Banco ${databaseName} criado.`);
    } else {
      console.log(`Banco ${databaseName} já existe.`);
    }
  } finally {
    await client.end();
  }

  // Migracoes e depois o seed das categorias padrao globais (businessId
  // null) - dado de referencia do sistema, nao de usuario, que os testes de
  // integracao e o cadastro esperam existir. O seed e idempotente.
  for (const args of [["prisma", "migrate", "deploy"], ["prisma", "db", "seed"]]) {
    const result = spawnSync("npx", args, {
      stdio: "inherit",
      shell: true,
      env: { ...process.env, DATABASE_URL: url },
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
