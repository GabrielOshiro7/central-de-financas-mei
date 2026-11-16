// Processo de longa duracao dos testes de idempotencia da F5: roda a materializacao com o
// processo num TZ escolhido por quem o subiu (variavel TZ do ambiente) - o cenario do
// incidente das duplicatas (servidor em UTC materializando os mesmos moldes que um
// servidor em JST ja tinha gerado).
//
// Antes, cada chamada subia um processo novo via tsx (~1 s so de partida, e varias vezes
// mais com a suite inteira em paralelo - o caso estourava o limite). Agora um worker por
// fuso sobe UMA vez no globalSetup do Vitest (tests/globalSetup/timeZoneWorkers.ts), antes
// de a maquina ficar carregada, e atende as chamadas por HTTP local. Ele continua sendo um
// PROCESSO com TZ proprio: `processTimeZone` na resposta e o fuso que ele realmente viu.
import { createServer } from "node:http";
import { assertTestDatabase, loadTestEnv } from "../testEnv";

loadTestEnv();
assertTestDatabase();

type Request = { kind: "entries" | "bills"; businessId: string; userId: string; now: string };

async function main() {
  // Carregados e conectados antes de anunciar "READY": a 1a chamada ja nao paga a partida.
  const { prisma } = await import("@/lib/db");
  const { materializeRecurringEntries } = await import("@/lib/finance/recurring/materialize");
  const { materializeRecurringBills } = await import("@/lib/finance/bills/materialize");
  const { getBusinessClock } = await import("@/lib/time/businessClock");
  await prisma.$connect();

  async function run({ kind, businessId, userId, now }: Request) {
    const at = new Date(now);
    const created =
      kind === "entries"
        ? (await materializeRecurringEntries(businessId, userId, at)).created
        : (await materializeRecurringBills(businessId, await getBusinessClock(businessId, at))).created;
    return { processTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, created };
  }

  const server = createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const result = await run(JSON.parse(body) as Request);
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: error instanceof Error ? error.stack : String(error) }));
      }
    });
  });
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    console.log(`READY ${typeof address === "object" && address ? address.port : 0}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
