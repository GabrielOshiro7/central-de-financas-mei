// Fusos em que os testes de idempotencia da F5 rodam a materializacao num PROCESSO proprio
// (um worker por fuso, subido no globalSetup do Vitest). Para testar outro fuso, acrescente-o aqui.
export const TIME_ZONE_WORKER_ZONES = ["UTC", "America/New_York", "Asia/Tokyo"] as const;

export type TimeZoneWorkerZone = (typeof TIME_ZONE_WORKER_ZONES)[number];
