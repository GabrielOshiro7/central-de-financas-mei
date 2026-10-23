import { assertTestDatabase, loadTestEnv } from "../testEnv";

// Segunda linha de defesa (a primeira e a checagem no proprio
// playwright.config.ts, que roda antes de o webServer subir).
export default function globalSetup() {
  loadTestEnv();
  assertTestDatabase();
}
