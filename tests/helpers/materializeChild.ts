// Processo filho dos testes de idempotencia da F5: roda a materializacao com
// o processo num TZ escolhido pelo pai (variavel TZ do ambiente) - o cenario
// do incidente das duplicatas (servidor em UTC materializando os mesmos
// moldes que um servidor em JST ja tinha gerado). Imprime uma linha JSON.
import { assertTestDatabase, loadTestEnv } from "../testEnv";

loadTestEnv();
assertTestDatabase();

async function main() {
  const [kind, businessId, userId, nowIso] = process.argv.slice(2);
  const { prisma } = await import("@/lib/db");
  const now = new Date(nowIso);
  let created: number;
  if (kind === "entries") {
    const { materializeRecurringEntries } = await import("@/lib/finance/recurring/materialize");
    created = (await materializeRecurringEntries(businessId, userId, now)).created;
  } else {
    const { materializeRecurringBills } = await import("@/lib/finance/bills/materialize");
    const { getBusinessClock } = await import("@/lib/time/businessClock");
    created = (await materializeRecurringBills(businessId, await getBusinessClock(businessId, now))).created;
  }
  await prisma.$disconnect();
  console.log(JSON.stringify({ processTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, created }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
