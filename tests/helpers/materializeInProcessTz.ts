import { spawnSync } from "node:child_process";
import { join } from "node:path";

// Roda materializeRecurringEntries/materializeRecurringBills num PROCESSO
// FILHO com o fuso do processo = `processTimeZone` (ver materializeChild.ts).
// Devolve o fuso que o filho realmente viu, para o teste provar que rodou nele.
export function materializeInProcessTz(
  processTimeZone: string,
  kind: "entries" | "bills",
  businessId: string,
  userId: string,
  now: Date
): { processTimeZone: string; created: number } {
  const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const child = join(process.cwd(), "tests", "helpers", "materializeChild.ts");
  const result = spawnSync(process.execPath, [tsxCli, child, kind, businessId, userId, now.toISOString()], {
    cwd: process.cwd(),
    env: { ...process.env, TZ: processTimeZone },
    encoding: "utf8",
    timeout: 60_000,
  });
  if (result.status !== 0) {
    throw new Error(`materializeChild falhou (TZ=${processTimeZone}): ${result.stderr || result.error}`);
  }
  const lastLine = result.stdout.trim().split("\n").pop()!;
  return JSON.parse(lastLine);
}
