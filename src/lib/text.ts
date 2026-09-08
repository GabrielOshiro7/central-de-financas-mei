// Remove acentos/diacriticos (NFD + descarta os marcadores de combinacao).
// Ex.: "Água" -> "Agua", "Descrição" -> "Descricao".
const COMBINING_DIACRITICS = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, "g");

export function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(COMBINING_DIACRITICS, "");
}
