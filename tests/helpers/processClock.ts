import type { BusinessClock } from "@/lib/time/zoned";

// Testes ANTERIORES a F3a montam datas esperadas com o construtor local do
// Date (new Date(2026, 2, 15)), ou seja, no fuso do PROCESSO. Desde a F3a o
// periodo e resolvido no fuso da EMPRESA, passado explicitamente - entao
// esses testes passam o proprio fuso do processo como fuso da empresa, o que
// reproduz exatamente o contrato que eles sempre verificaram, em qualquer TZ
// da matriz. Cenarios com fuso da empresa DIFERENTE do processo ficam nos
// testes novos (tests/unit/finance/periodTimeZone.test.ts e afins).
export const PROCESS_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function processClock(now: Date = new Date()): BusinessClock {
  return { now, timeZone: PROCESS_TZ };
}
