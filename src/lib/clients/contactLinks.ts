// Atalhos de contato do cliente ("Ligar" e "WhatsApp") a partir do texto livre de telefone/WhatsApp (ate 40
// caracteres, sem formato). Funcoes puras, sem rede: o sistema so monta o link; quem liga ou conversa e o usuario.

// So digitos e a formatacao comum de telefone (espacos, "-", "(", ")", ".", "/" e "+"); qualquer letra ou outro
// simbolo ("ramal 12", "ligar depois") torna o numero ambiguo: nenhum atalho e gerado.
const PHONE_TEXT = /^[\d\s().\-/+]+$/;

function digitsOf(raw: string): string | null {
  const text = raw.trim();
  if (!PHONE_TEXT.test(text)) return null;
  const digits = text.replace(/\D/g, "");
  return digits ? digits : null;
}

// "tel:" so com digitos; o "+" inicial digitado pelo usuario e preservado. Vale para QUALQUER numero (de qualquer pais).
//   "090-1234-5678" -> tel:09012345678   |   "+55 11 91234-5678" -> tel:+5511912345678
export function telHref(raw: string): string | null {
  const digits = digitsOf(raw);
  if (!digits) return null;
  return `tel:${raw.trim().startsWith("+") ? "+" : ""}${digits}`;
}

// WhatsApp: por decisao do dono, SO numeros do Brasil (+55) e do Japao (+81) geram atalho; qualquer outro numero fica sem
// o atalho (o "Ligar" continua). Nunca se gera um link para um numero que possa estar errado.
//   Internacional BR valido: comeca com 55 e tem 12 ou 13 digitos (55 + DDD de 2 + 8 ou 9).
//   Internacional JP valido: comeca com 81 e tem 11 ou 12 digitos (81 + numero sem o 0 inicial, 9 ou 10 digitos).
const BR_CODE = "55";
const JP_CODE = "81";

function isBrInternational(digits: string): boolean {
  return digits.startsWith(BR_CODE) && (digits.length === 12 || digits.length === 13);
}

function isJpInternational(digits: string): boolean {
  return digits.startsWith(JP_CODE) && (digits.length === 11 || digits.length === 12);
}

function isBrOrJpInternational(digits: string): boolean {
  return isBrInternational(digits) || isJpInternational(digits);
}

// Digitos internacionais (sem o "+") para o wa.me, ou null. `country` e o pais da empresa (Business.country).
export function whatsappDigits(raw: string, country: string): string | null {
  const digits = digitsOf(raw);
  if (!digits) return null;
  const text = raw.trim();

  // 1. Digitado com "+" ou "00": ja e internacional; so vale se for BR ou JP validos.
  if (text.startsWith("+")) return isBrOrJpInternational(digits) ? digits : null;
  if (digits.startsWith("00")) {
    const international = digits.slice(2);
    return isBrOrJpInternational(international) ? international : null;
  }

  // 2. Sem "+" nem "00": depende do pais da empresa.
  if (country === "JP") {
    if (digits.startsWith("0")) {
      const international = JP_CODE + digits.slice(1);
      return isJpInternational(international) ? international : null;
    }
    return isBrOrJpInternational(digits) ? digits : null;
  }

  if (country === "BR") {
    if (digits.startsWith("0")) {
      const international = BR_CODE + digits.slice(1);
      return isBrInternational(international) ? international : null;
    }
    // Numero local (DDD + numero). Atencao: 81 tambem e o DDD de Recife, entao "81 91234-5678" e local do Brasil.
    if (digits.length === 10 || digits.length === 11) return BR_CODE + digits;
    // Ja internacional, sem "+": BR (12-13 digitos) ou JP so com 12 digitos (acima de 11 nao ha confusao com numero local).
    if (isBrInternational(digits) || (isJpInternational(digits) && digits.length === 12)) return digits;
    return null;
  }

  // Empresa de outro pais: sem "+"/"00" nao ha como saber o pais do numero.
  return null;
}

export function whatsappHref(raw: string, country: string): string | null {
  const digits = whatsappDigits(raw, country);
  return digits ? `https://wa.me/${digits}` : null;
}

export type ClientContact = { display: string; telHref: string | null; whatsappHref: string | null };

// O que o cartao do agendamento mostra: com WhatsApp, o numero dele e os dois atalhos; sem WhatsApp mas com telefone, o
// telefone so com "Ligar"; sem nenhum dos dois (ou sem cliente), nada.
export function contactFor(client: { whatsapp: string | null; phone: string | null } | null, country: string): ClientContact | null {
  if (!client) return null;
  const whatsapp = client.whatsapp?.trim();
  if (whatsapp) return { display: whatsapp, telHref: telHref(whatsapp), whatsappHref: whatsappHref(whatsapp, country) };
  const phone = client.phone?.trim();
  if (phone) return { display: phone, telHref: telHref(phone), whatsappHref: null };
  return null;
}
