import { z } from "zod";
import { isValidTimeZone } from "@/lib/time/zoned";

// Validacao dos campos Business.country / Business.timezone (Etapa F2).
// A tela de Configuracoes que os usa e a F7; aqui ficam so as regras.

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

// ISO 3166-1 alfa-2 em maiusculas e conhecido pelo Intl (nomes de regiao do
// proprio runtime, sem tabela propria). A lista pais -> fusos (para restringir
// o fuso ao pais escolhido) e da F7.
const regionNames = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });

export function isCountryCode(value: string): boolean {
  if (!/^[A-Z]{2}$/.test(value)) return false;
  try {
    const name = regionNames.of(value);
    return typeof name === "string" && name !== "Unknown Region";
  } catch {
    return false;
  }
}

export const countryCodeSchema = z
  .string()
  .trim()
  .refine(isCountryCode, "País inválido. Use o código ISO de 2 letras, ex.: JP.");
