import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRIVACY_POLICY } from "@/content/legal";
import { PRIVACY_CHANGES } from "@/content/legal/changes";
import { PRIVACY_POLICY_VERSION } from "@/content/legal/meta";
import { legalDocumentStrings } from "@/content/legal/types";

// A Política de Privacidade descreve a limpeza de sessões e links vencidos. O texto tem de ser fiel ao
// código: os números saem das constantes (lidas do fonte, para não abrir conexão com o banco num teste
// de unidade) e os dois pontos que disparam a limpeza (login e pedido de recuperação) usam after().
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const constant = (file: string, name: string): number => {
  const match = new RegExp(`${name}\\s*=\\s*([^;]+);`).exec(read(file));
  if (!match) throw new Error(`constante ${name} não achada em ${file}`);
  // Avalia só aritmética simples de literais (ex.: 24 * 60 * 60 * 1000).
  if (!/^[\d\s*+\-/().]+$/.test(match[1].replace(/\/\/.*$/, ""))) throw new Error(`expressão inesperada: ${match[1]}`);
  return Function(`"use strict"; return (${match[1].replace(/\/\/.*$/, "")});`)();
};

describe("Política de Privacidade: remoção de sessões e links vencidos", () => {
  const text = legalDocumentStrings(PRIVACY_POLICY).join("\n");

  it("o marcador antigo foi substituído (nada de [PREENCHER] sobre remoção do banco)", () => {
    expect(text).not.toContain("confirmar se e quando são removidos do banco");
    expect(text).toContain("Remoção do banco de dados");
  });

  it("os números do texto são os do código", () => {
    const inactivity = constant("src/lib/auth/sessionPolicy.ts", "INACTIVITY_TIMEOUT_MINUTES");
    const absolute = constant("src/lib/auth/sessionPolicy.ts", "ABSOLUTE_SESSION_DAYS_DEFAULT");
    const remembered = constant("src/lib/auth/sessionPolicy.ts", "ABSOLUTE_SESSION_DAYS_REMEMBERED");
    const resetMinutes = constant("src/lib/auth/resetToken.ts", "RESET_TOKEN_DURATION_MS") / 60000;
    const graceHours = constant("src/lib/auth/cleanup.ts", "CLEANUP_GRACE_MS") / 3600000;
    const batch = constant("src/lib/auth/cleanup.ts", "CLEANUP_BATCH_SIZE");
    expect([inactivity, absolute, remembered, resetMinutes, graceHours, batch]).toEqual([60, 7, 30, 45, 24, 500]);
    expect(text).toContain(`${inactivity} minutos sem atividade`);
    expect(text).toContain(`limite de ${absolute} dias`);
    expect(text).toContain(`(${remembered} dias se você marcou`);
    expect(text).toContain(`valem ${resetMinutes} minutos`);
    expect(text).toContain(`mais de ${graceHours} horas do vencimento`);
    expect(text).toContain(`lotes de até ${batch} registros`);
  });

  it("diz a verdade sobre a frequência: depois de login e de pedido de recuperação, sem rotina agendada", () => {
    expect(text).toContain("depois de cada login concluído e de cada pedido de recuperação de senha de um e-mail cadastrado");
    expect(text).toContain("Não há rotina agendada");
  });

  it("a limpeza roda de fato: login e recuperação de senha a disparam por after() do Next", () => {
    for (const route of ["src/app/api/auth/login/route.ts", "src/app/api/auth/forgot-password/route.ts"]) {
      const source = read(route);
      expect(source, route).toContain("after(() => cleanupExpiredAuthDataSafely())");
      expect(source, route).toMatch(/import \{[^}]*\bafter\b[^}]*\} from "next\/server"/);
    }
  });

  it("a Política vigente tem resumo e a mudança sobre sessões e links vencidos tem o seu (entrada histórica 0.4)", () => {
    expect(PRIVACY_POLICY.version).toBe(PRIVACY_POLICY_VERSION);
    expect(PRIVACY_CHANGES.map((c) => c.version)).toContain(PRIVACY_POLICY_VERSION);
    const change = PRIVACY_CHANGES.find((c) => c.version === "0.4");
    expect(change?.summary.join(" ")).toMatch(/sessões e links de recuperação de senha vencidos/i);
  });
});
