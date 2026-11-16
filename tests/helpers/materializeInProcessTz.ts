import { inject } from "vitest";
import type { TimeZoneWorkerZone } from "./timeZoneWorkers";

// Roda materializeRecurringEntries/materializeRecurringBills num PROCESSO com o fuso
// `processTimeZone` (um worker por fuso, subido no globalSetup - ver materializeWorker.ts).
// Devolve o fuso que o processo realmente viu, para o teste provar que rodou nele.
export async function materializeInProcessTz(
  processTimeZone: TimeZoneWorkerZone,
  kind: "entries" | "bills",
  businessId: string,
  userId: string,
  now: Date
): Promise<{ processTimeZone: string; created: number }> {
  const port = inject("timeZoneWorkerPorts")[processTimeZone];
  if (!port) throw new Error(`Sem worker para o fuso ${processTimeZone} (ver tests/helpers/timeZoneWorkers.ts).`);
  const res = await fetch(`http://127.0.0.1:${port}/`, {
    method: "POST",
    body: JSON.stringify({ kind, businessId, userId, now: now.toISOString() }),
  });
  const body = (await res.json()) as { processTimeZone: string; created: number; error?: string };
  if (!res.ok) throw new Error(`worker ${processTimeZone} falhou: ${body.error}`);
  return { processTimeZone: body.processTimeZone, created: body.created };
}
