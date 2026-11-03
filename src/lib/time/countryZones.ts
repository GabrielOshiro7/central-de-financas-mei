import type { TimeZone } from "@/lib/time/zoned";

// Tabela propria pais -> fusos IANA (Etapa F7, plano secao 3.6). Curada a
// mao, NAO gerada do zone1970.tab: os rotulos sao em portugues (cidade ou
// regiao de referencia), o que nenhuma fonte automatica fornece. Cobre os
// paises com que o produto trabalha hoje (Japao, lusofonos, Americas e os
// principais da Europa, Asia e Oceania); pais novo entra aqui, nunca em
// componente.
//
// Regras:
// - zones[0] e o fuso padrao do pais (o mais populoso), usado quando o pais
//   muda e o fuso atual nao pertence a ele.
// - Pais com UM fuso: a tela mostra so o pais (o fuso e implicito).
// - Pais com varios fusos: um fuso de referencia por horario distinto (ex.:
//   Brasil -> Brasilia, Manaus, Cuiaba, Rio Branco, Fernando de Noronha), nao
//   todos os ids IANA historicos do pais.
// - Ids IANA modernos (ex.: Asia/Kolkata); o ICU de alguns runtimes so lista
//   o alias legado (Asia/Calcutta) em Intl.supportedValuesOf, mas aceita os
//   dois - ver tests/unit/time/countryZones.test.ts.
// - Todo id daqui tambem precisa existir no tzdata do Postgres (backfills de
//   migracao usam "businesses"."timezone" em AT TIME ZONE).

export type CountryZone = { timeZone: TimeZone; label: string };
export type CountryZones = { code: string; name: string; zones: readonly CountryZone[] };

export const DEFAULT_COUNTRY = "JP";
export const DEFAULT_TIME_ZONE: TimeZone = "Asia/Tokyo";

const one = (timeZone: TimeZone, label: string): readonly CountryZone[] => [{ timeZone, label }];

const TABLE: readonly CountryZones[] = [
  { code: "JP", name: "Japão", zones: one("Asia/Tokyo", "Tóquio") },
  {
    code: "BR",
    name: "Brasil",
    zones: [
      { timeZone: "America/Sao_Paulo", label: "Brasília" },
      { timeZone: "America/Manaus", label: "Manaus" },
      { timeZone: "America/Cuiaba", label: "Cuiabá" },
      { timeZone: "America/Rio_Branco", label: "Rio Branco" },
      { timeZone: "America/Noronha", label: "Fernando de Noronha" },
    ],
  },
  {
    code: "PT",
    name: "Portugal",
    zones: [
      { timeZone: "Europe/Lisbon", label: "Lisboa (continente)" },
      { timeZone: "Atlantic/Madeira", label: "Madeira" },
      { timeZone: "Atlantic/Azores", label: "Açores" },
    ],
  },
  {
    code: "US",
    name: "Estados Unidos",
    zones: [
      { timeZone: "America/New_York", label: "Nova York (Leste)" },
      { timeZone: "America/Chicago", label: "Chicago (Central)" },
      { timeZone: "America/Denver", label: "Denver (Montanhas)" },
      { timeZone: "America/Phoenix", label: "Phoenix (Arizona)" },
      { timeZone: "America/Los_Angeles", label: "Los Angeles (Pacífico)" },
      { timeZone: "America/Anchorage", label: "Anchorage (Alasca)" },
      { timeZone: "Pacific/Honolulu", label: "Honolulu (Havaí)" },
    ],
  },
  {
    code: "CA",
    name: "Canadá",
    zones: [
      { timeZone: "America/Toronto", label: "Toronto (Leste)" },
      { timeZone: "America/Vancouver", label: "Vancouver (Pacífico)" },
      { timeZone: "America/Edmonton", label: "Edmonton (Montanhas)" },
      { timeZone: "America/Winnipeg", label: "Winnipeg (Central)" },
      { timeZone: "America/Halifax", label: "Halifax (Atlântico)" },
      { timeZone: "America/St_Johns", label: "St. John's (Terra Nova)" },
    ],
  },
  {
    code: "MX",
    name: "México",
    zones: [
      { timeZone: "America/Mexico_City", label: "Cidade do México" },
      { timeZone: "America/Cancun", label: "Cancún" },
      { timeZone: "America/Mazatlan", label: "Mazatlán (Pacífico)" },
      { timeZone: "America/Hermosillo", label: "Hermosillo (Sonora)" },
      { timeZone: "America/Tijuana", label: "Tijuana (Noroeste)" },
    ],
  },
  { code: "AR", name: "Argentina", zones: one("America/Argentina/Buenos_Aires", "Buenos Aires") },
  { code: "BO", name: "Bolívia", zones: one("America/La_Paz", "La Paz") },
  {
    code: "CL",
    name: "Chile",
    zones: [
      { timeZone: "America/Santiago", label: "Santiago" },
      { timeZone: "Pacific/Easter", label: "Ilha de Páscoa" },
    ],
  },
  { code: "CO", name: "Colômbia", zones: one("America/Bogota", "Bogotá") },
  {
    code: "EC",
    name: "Equador",
    zones: [
      { timeZone: "America/Guayaquil", label: "Guayaquil (continente)" },
      { timeZone: "Pacific/Galapagos", label: "Galápagos" },
    ],
  },
  { code: "PY", name: "Paraguai", zones: one("America/Asuncion", "Assunção") },
  { code: "PE", name: "Peru", zones: one("America/Lima", "Lima") },
  { code: "UY", name: "Uruguai", zones: one("America/Montevideo", "Montevidéu") },
  { code: "VE", name: "Venezuela", zones: one("America/Caracas", "Caracas") },
  {
    code: "ES",
    name: "Espanha",
    zones: [
      { timeZone: "Europe/Madrid", label: "Madri (península)" },
      { timeZone: "Atlantic/Canary", label: "Ilhas Canárias" },
    ],
  },
  { code: "FR", name: "França", zones: one("Europe/Paris", "Paris") },
  { code: "DE", name: "Alemanha", zones: one("Europe/Berlin", "Berlim") },
  { code: "IT", name: "Itália", zones: one("Europe/Rome", "Roma") },
  { code: "GB", name: "Reino Unido", zones: one("Europe/London", "Londres") },
  { code: "IE", name: "Irlanda", zones: one("Europe/Dublin", "Dublin") },
  { code: "CH", name: "Suíça", zones: one("Europe/Zurich", "Zurique") },
  { code: "NL", name: "Países Baixos", zones: one("Europe/Amsterdam", "Amsterdã") },
  { code: "BE", name: "Bélgica", zones: one("Europe/Brussels", "Bruxelas") },
  { code: "AO", name: "Angola", zones: one("Africa/Luanda", "Luanda") },
  { code: "MZ", name: "Moçambique", zones: one("Africa/Maputo", "Maputo") },
  { code: "CV", name: "Cabo Verde", zones: one("Atlantic/Cape_Verde", "Praia") },
  { code: "ZA", name: "África do Sul", zones: one("Africa/Johannesburg", "Joanesburgo") },
  { code: "CN", name: "China", zones: one("Asia/Shanghai", "Pequim") },
  { code: "HK", name: "Hong Kong", zones: one("Asia/Hong_Kong", "Hong Kong") },
  { code: "MO", name: "Macau", zones: one("Asia/Macau", "Macau") },
  { code: "TW", name: "Taiwan", zones: one("Asia/Taipei", "Taipé") },
  { code: "KR", name: "Coreia do Sul", zones: one("Asia/Seoul", "Seul") },
  { code: "PH", name: "Filipinas", zones: one("Asia/Manila", "Manila") },
  { code: "VN", name: "Vietnã", zones: one("Asia/Ho_Chi_Minh", "Ho Chi Minh") },
  { code: "TH", name: "Tailândia", zones: one("Asia/Bangkok", "Bangcoc") },
  { code: "SG", name: "Singapura", zones: one("Asia/Singapore", "Singapura") },
  { code: "TL", name: "Timor-Leste", zones: one("Asia/Dili", "Díli") },
  { code: "IN", name: "Índia", zones: one("Asia/Kolkata", "Nova Délhi") },
  {
    code: "ID",
    name: "Indonésia",
    zones: [
      { timeZone: "Asia/Jakarta", label: "Jacarta (Oeste)" },
      { timeZone: "Asia/Makassar", label: "Makassar (Central)" },
      { timeZone: "Asia/Jayapura", label: "Jayapura (Leste)" },
    ],
  },
  { code: "AE", name: "Emirados Árabes Unidos", zones: one("Asia/Dubai", "Dubai") },
  {
    code: "AU",
    name: "Austrália",
    zones: [
      { timeZone: "Australia/Sydney", label: "Sydney" },
      { timeZone: "Australia/Brisbane", label: "Brisbane" },
      { timeZone: "Australia/Adelaide", label: "Adelaide" },
      { timeZone: "Australia/Darwin", label: "Darwin" },
      { timeZone: "Australia/Perth", label: "Perth" },
    ],
  },
  { code: "NZ", name: "Nova Zelândia", zones: one("Pacific/Auckland", "Auckland") },
];

// Ordenada pelo nome em portugues - a ordem do select.
export const COUNTRY_ZONES: readonly CountryZones[] = [...TABLE].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

const BY_CODE = new Map(COUNTRY_ZONES.map((c) => [c.code, c]));

export function findCountry(code: string): CountryZones | undefined {
  return BY_CODE.get(code);
}

export function isSupportedCountry(code: string): boolean {
  return BY_CODE.has(code);
}

export function isZoneOfCountry(code: string, timeZone: string): boolean {
  return BY_CODE.get(code)?.zones.some((z) => z.timeZone === timeZone) ?? false;
}

// Fuso a usar ao escolher `code`: o atual, se pertencer ao pais; senao o
// padrao do pais (zones[0]).
export function zoneForCountry(code: string, currentTimeZone: string): TimeZone | undefined {
  const country = BY_CODE.get(code);
  if (!country) return undefined;
  return isZoneOfCountry(code, currentTimeZone) ? currentTimeZone : country.zones[0].timeZone;
}

// Rotulo do fuso no select ("Brasília", "Nova York (Leste)"). Fuso fora da
// tabela (nunca deveria acontecer depois da F7) cai no nome da cidade do id
// IANA.
export function timeZoneLabel(timeZone: string): string {
  for (const country of COUNTRY_ZONES) {
    const zone = country.zones.find((z) => z.timeZone === timeZone);
    if (zone) return zone.label;
  }
  return (timeZone.split("/").pop() ?? timeZone).replace(/_/g, " ");
}

// So a cidade de referencia, sem o complemento entre parenteses ("Nova
// York (Leste)" -> "Nova York") - ex.: "Início (horário de Nova York)" na
// Agenda.
export function timeZoneCity(timeZone: string): string {
  return timeZoneLabel(timeZone).replace(/\s*\(.*\)$/, "");
}
