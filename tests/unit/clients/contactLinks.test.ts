import { describe, expect, it } from "vitest";
import { contactFor, telHref, whatsappDigits, whatsappHref } from "@/lib/clients/contactLinks";

// WhatsApp so para numeros do Brasil (+55) e do Japao (+81); o "Ligar" (telHref) vale para qualquer numero.
const wa = (digits: string) => `https://wa.me/${digits}`;

describe("whatsappHref: empresa do Japao (JP)", () => {
  it("numero local com 0 inicial: 81 + numero sem o 0", () => {
    expect(whatsappHref("090-1234-5678", "JP")).toBe(wa("819012345678"));
    expect(whatsappHref("090 1234 5678", "JP")).toBe(wa("819012345678"));
    expect(whatsappHref("03-1234-5678", "JP")).toBe(wa("81312345678")); // fixo de Toquio: 11 digitos, JP valido
  });

  it("numero com 0 inicial que nao vira JP valido: sem atalho", () => {
    expect(whatsappHref("090123456", "JP")).toBeNull(); // 81 + 90123456 = 10 digitos
    expect(whatsappHref("0901234567890", "JP")).toBeNull(); // 81 + 12 digitos = 14
  });

  it("ja internacional, sem + nem 00: BR ou JP validos passam como estao", () => {
    expect(whatsappHref("5511912345678", "JP")).toBe(wa("5511912345678")); // antes virava 815511912345678 (numero errado)
    expect(whatsappHref("819012345678", "JP")).toBe(wa("819012345678"));
    expect(whatsappHref("551112345678", "JP")).toBe(wa("551112345678")); // BR fixo, 12 digitos
    expect(whatsappHref("81312345678", "JP")).toBe(wa("81312345678")); // JP com 11 digitos
  });

  it("com +: BR e JP validos; outro pais nao gera atalho", () => {
    expect(whatsappHref("+55 11 91234-5678", "JP")).toBe(wa("5511912345678"));
    expect(whatsappHref("+81 90-1234-5678", "JP")).toBe(wa("819012345678"));
    expect(whatsappHref("+39 06 1234 5678", "JP")).toBeNull();
  });

  it("curto, longo ou sem sentido: sem atalho", () => {
    expect(whatsappHref("12345", "JP")).toBeNull();
    expect(whatsappHref("123456789012345", "JP")).toBeNull();
  });
});

describe("whatsappHref: empresa do Brasil (BR)", () => {
  it("numero local com DDD (10 ou 11 digitos): 55 + numero", () => {
    expect(whatsappHref("(11) 91234-5678", "BR")).toBe(wa("5511912345678"));
    expect(whatsappHref("(11) 1234-5678", "BR")).toBe(wa("551112345678"));
  });

  it("81 e o DDD de Recife: continua numero local do Brasil, nunca do Japao", () => {
    expect(whatsappHref("(81) 91234-5678", "BR")).toBe(wa("5581912345678"));
    expect(whatsappHref("81 1234-5678", "BR")).toBe(wa("558112345678"));
  });

  it("0 antes do DDD: 55 + numero sem o 0", () => {
    expect(whatsappHref("011 91234-5678", "BR")).toBe(wa("5511912345678"));
    expect(whatsappHref("0 11 1234-5678", "BR")).toBe(wa("551112345678"));
  });

  it("0 inicial que nao vira BR valido: sem atalho", () => {
    expect(whatsappHref("01 1234-567", "BR")).toBeNull(); // 55 + 8 digitos = 10
    expect(whatsappHref("0119123456789", "BR")).toBeNull(); // 55 + 12 digitos = 14
  });

  it("ja internacional, sem + nem 00: BR (12-13) e JP (so 12 digitos)", () => {
    expect(whatsappHref("5511912345678", "BR")).toBe(wa("5511912345678"));
    expect(whatsappHref("551112345678", "BR")).toBe(wa("551112345678"));
    expect(whatsappHref("819012345678", "BR")).toBe(wa("819012345678"));
    expect(whatsappHref("81312345678", "BR")).toBe(wa("5581312345678")); // 11 digitos: e local (DDD 81), nao JP
  });

  it("com +: BR e JP validos; outro pais nao gera atalho", () => {
    expect(whatsappHref("+81 90-1234-5678", "BR")).toBe(wa("819012345678"));
    expect(whatsappHref("+55 11 91234-5678", "BR")).toBe(wa("5511912345678"));
    expect(whatsappHref("+1 555 123 4567", "BR")).toBeNull();
  });

  it("tamanho que nao e local nem internacional: sem atalho", () => {
    expect(whatsappHref("12345", "BR")).toBeNull();
    expect(whatsappHref("123456789", "BR")).toBeNull(); // 9 digitos
    expect(whatsappHref("12345678901234", "BR")).toBeNull(); // 14 digitos, nao comeca com 55 nem 81
  });
});

describe("whatsappHref: empresa de outro pais (ex.: US)", () => {
  it("com +: BR e JP validos continuam funcionando", () => {
    expect(whatsappHref("+55 11 91234-5678", "US")).toBe(wa("5511912345678"));
    expect(whatsappHref("+81 90-1234-5678", "US")).toBe(wa("819012345678"));
  });

  it("sem + nem 00: sem atalho, mesmo parecendo um numero valido", () => {
    expect(whatsappHref("(11) 91234-5678", "US")).toBeNull();
    expect(whatsappHref("090-1234-5678", "US")).toBeNull();
    expect(whatsappHref("5511912345678", "US")).toBeNull();
    expect(whatsappHref("090-1234-5678", "XX")).toBeNull();
  });
});

describe("whatsappHref: prefixo 00 e limites de tamanho", () => {
  it("00: remove o 00 e so vale para BR ou JP validos, em qualquer pais da empresa", () => {
    expect(whatsappHref("0055 11 91234-5678", "JP")).toBe(wa("5511912345678"));
    expect(whatsappHref("0081-90-1234-5678", "BR")).toBe(wa("819012345678"));
    expect(whatsappHref("0081-90-1234-5678", "US")).toBe(wa("819012345678"));
    expect(whatsappHref("0039 06 1234 5678", "JP")).toBeNull(); // Italia
    expect(whatsappHref("0090123456", "JP")).toBeNull(); // sobra "90123456": nem BR nem JP
  });

  it("limites do Brasil: 12 e 13 digitos passam; 11 e 14 nao", () => {
    expect(whatsappHref("+55 11 1234-5678", "JP")).toBe(wa("551112345678")); // 12
    expect(whatsappHref("+55 11 91234-5678", "JP")).toBe(wa("5511912345678")); // 13
    expect(whatsappHref("+55 11 1234-567", "JP")).toBeNull(); // 11
    expect(whatsappHref("+55 11 91234-56789", "JP")).toBeNull(); // 14
  });

  it("limites do Japao: 11 e 12 digitos passam; 10 e 13 nao", () => {
    expect(whatsappHref("+81 3-1234-5678", "JP")).toBe(wa("81312345678")); // 11
    expect(whatsappHref("+81 90-1234-5678", "JP")).toBe(wa("819012345678")); // 12
    expect(whatsappHref("+81 3-1234-567", "JP")).toBeNull(); // 10
    expect(whatsappHref("+81 90-1234-56789", "JP")).toBeNull(); // 13
  });

  it("letras e lixo: sem atalho", () => {
    expect(whatsappHref("abc", "JP")).toBeNull();
    expect(whatsappHref("---", "JP")).toBeNull();
    expect(whatsappHref("", "JP")).toBeNull();
    expect(whatsappHref("090-1234-5678 ramal 12", "JP")).toBeNull();
    expect(whatsappHref("+55 11 9ABCD-5678", "JP")).toBeNull();
  });

  it("whatsappDigits devolve so os digitos (sem https://wa.me/)", () => {
    expect(whatsappDigits("090-1234-5678", "JP")).toBe("819012345678");
    expect(whatsappDigits("+39 06 1234 5678", "JP")).toBeNull();
  });
});

describe("telHref (nao muda: vale para qualquer numero)", () => {
  it("so digitos", () => {
    expect(telHref("090-1234-5678")).toBe("tel:09012345678");
    expect(telHref("(11) 91234-5678")).toBe("tel:11912345678");
  });

  it("preserva o + inicial", () => {
    expect(telHref("+55 11 91234-5678")).toBe("tel:+5511912345678");
    expect(telHref("  +81 90-1234-5678 ")).toBe("tel:+819012345678");
  });

  it("numero de outro pais continua com Ligar", () => {
    expect(telHref("+39 06 1234 5678")).toBe("tel:+390612345678");
    expect(telHref("+1 555 123 4567")).toBe("tel:+15551234567");
  });

  it("letras, lixo ou vazio: sem atalho", () => {
    expect(telHref("abc")).toBeNull();
    expect(telHref("")).toBeNull();
    expect(telHref("+")).toBeNull();
    expect(telHref("090-1234-5678 ramal 12")).toBeNull();
  });
});

describe("contactFor: o que o cartao mostra", () => {
  it("com WhatsApp: o numero dele (como digitado) e os dois atalhos, mesmo se tiver telefone", () => {
    expect(contactFor({ whatsapp: " 090-1111-2222 ", phone: "03-1234-5678" }, "JP")).toEqual({
      display: "090-1111-2222",
      telHref: "tel:09011112222",
      whatsappHref: wa("819011112222"),
    });
  });

  it("numero de outro pais (+39): mostra o numero e o Ligar, sem o atalho de WhatsApp", () => {
    expect(contactFor({ whatsapp: "+39 06 1234 5678", phone: null }, "JP")).toEqual({
      display: "+39 06 1234 5678",
      telHref: "tel:+390612345678",
      whatsappHref: null,
    });
  });

  it("sem WhatsApp mas com telefone: so Ligar", () => {
    expect(contactFor({ whatsapp: null, phone: "03-1234-5678" }, "JP")).toEqual({ display: "03-1234-5678", telHref: "tel:0312345678", whatsappHref: null });
    expect(contactFor({ whatsapp: "   ", phone: "03-1234-5678" }, "JP")?.whatsappHref).toBeNull();
  });

  it("WhatsApp curto demais: mostra o numero e o Ligar, sem o atalho de WhatsApp", () => {
    expect(contactFor({ whatsapp: "123", phone: null }, "JP")).toEqual({ display: "123", telHref: "tel:123", whatsappHref: null });
  });

  it("nenhum dos dois, ou sem cliente: nada", () => {
    expect(contactFor({ whatsapp: null, phone: null }, "JP")).toBeNull();
    expect(contactFor({ whatsapp: "  ", phone: "" }, "JP")).toBeNull();
    expect(contactFor(null, "JP")).toBeNull();
  });
});
