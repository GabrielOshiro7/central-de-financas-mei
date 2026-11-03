import { z } from "zod";
import { isValidTimeZone } from "@/lib/time/zoned";
import { isSupportedCountry, isZoneOfCountry } from "@/lib/time/countryZones";

// Validacao dos campos Business.country / Business.timezone (Etapa F2; a
// tela de Configuracoes que os grava e a F7).

// Nome IANA no formato Area/Local (ex.: "Asia/Tokyo", "America/Sao_Paulo",
// "Etc/GMT-9") ou "UTC". isValidTimeZone sozinho e permissivo de proposito
// (o Intl tambem aceita "+09:00", "asia/tokyo" e abreviacoes como "EST",
// normalizando-os) - otimo para calculo, mas o fuso GRAVADO da empresa deve
// ser sempre o identificador IANA escrito por extenso.
const IANA_NAME_PATTERN = /^[A-Z][A-Za-z_]+(\/[A-Z][A-Za-z0-9_+-]+)+$/;

export function isIanaTimeZoneName(value: string): boolean {
  return (value === "UTC" || IANA_NAME_PATTERN.test(value)) && isValidTimeZone(value);
}

export const timeZoneSchema = z
  .string()
  .trim()
  .refine(isIanaTimeZoneName, "Fuso horário inválido. Use um identificador IANA, ex.: Asia/Tokyo.");

// ISO 3166-1 alfa-2 em maiusculas E presente na tabela pais -> fusos
// (countryZones.ts, Etapa F7). Ate a F7 bastava o Intl conhecer o codigo, o
// que aceitava regioes que nao sao pais (ex.: "EU", "UN") e paises sem fuso
// mapeado.
export function isCountryCode(value: string): boolean {
  return /^[A-Z]{2}$/.test(value) && isSupportedCountry(value);
}

export const countryCodeSchema = z
  .string()
  .trim()
  .refine(isCountryCode, "País inválido. Escolha um país da lista.");

// Pais + fuso da empresa (Etapa F7, tela de Configuracoes): os dois validos
// por si e o fuso precisa ser um dos fusos do pais escolhido. strict: campo
// desconhecido e erro, nunca ignorado.
export const businessTimeZoneSchema = z
  .object({ country: countryCodeSchema, timezone: timeZoneSchema })
  .strict()
  .superRefine((data, ctx) => {
    if (!isZoneOfCountry(data.country, data.timezone)) {
      ctx.addIssue({ code: "custom", path: ["timezone"], message: "Fuso horário não pertence ao país escolhido." });
    }
  });

export type BusinessTimeZoneInput = z.infer<typeof businessTimeZoneSchema>;
