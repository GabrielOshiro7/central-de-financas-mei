import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import type { TestProject } from "vitest/node";
import { TIME_ZONE_WORKER_ZONES } from "../helpers/timeZoneWorkers";

// Sobe, UMA vez antes de todos os arquivos de teste, um processo por fuso (ver
// tests/helpers/materializeWorker.ts) e entrega as portas aos testes via `inject`.
// Rodar aqui, antes de os workers do Vitest carregarem 100+ arquivos em paralelo, e o que
// tira a partida dos processos de dentro do tempo limite de um teste.
declare module "vitest" {
  export interface ProvidedContext {
    timeZoneWorkerPorts: Record<string, number>;
  }
}

const START_TIMEOUT_MS = 60_000;

function startWorker(zone: string): Promise<{ child: ChildProcess; port: number }> {
  return new Promise((resolve, reject) => {
    // `node --import tsx` (e nao o cli do tsx): um processo so, sem processo neto - o
    // kill() do teardown encerra exatamente o worker. TZ no ambiente = fuso do processo.
    const child = spawn(process.execPath, ["--import", "tsx", join(process.cwd(), "tests", "helpers", "materializeWorker.ts")], {
      cwd: process.cwd(),
      env: { ...process.env, TZ: zone },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`[timeZoneWorkers] worker ${zone} nao ficou pronto em ${START_TIMEOUT_MS} ms.\n${stderr}`));
    }, START_TIMEOUT_MS);
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const match = /READY (\d+)/.exec(stdout);
      if (match) {
        clearTimeout(timer);
        resolve({ child, port: Number(match[1]) });
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`[timeZoneWorkers] worker ${zone} encerrou (codigo ${code}) antes de ficar pronto.\n${stderr}`));
    });
  });
}

export default async function setup(project: TestProject) {
  const workers = await Promise.all(TIME_ZONE_WORKER_ZONES.map(async (zone) => ({ zone, ...(await startWorker(zone)) })));
  project.provide("timeZoneWorkerPorts", Object.fromEntries(workers.map((w) => [w.zone, w.port])));
  return async () => {
    for (const worker of workers) {
      worker.child.removeAllListeners("exit");
      worker.child.kill();
    }
  };
}
