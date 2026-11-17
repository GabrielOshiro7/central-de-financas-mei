import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SENSITIVE_DATA_NOTICE } from "@/lib/privacy/sensitiveDataNotice";

// Todo campo livre de observacao (<textarea>) que pode guardar dados de terceiros usa o aviso
// padrao <SensitiveDataNotice /> ("Nao registre informacoes de saude..."). Campo novo sem o aviso
// quebra este teste; se o campo guarda so dado do PROPRIO usuario, entre na lista abaixo, com o motivo.
const NOT_THIRD_PARTY_DATA: Record<string, string> = {
  "src/app/onboarding/OnboardingWizard.tsx": "descricao do proprio negocio (como a empresa ganha dinheiro), nao e dado de terceiros",
};

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

describe("aviso padrão nos campos livres de observação", () => {
  it("o texto padrão é um só", () => {
    expect(SENSITIVE_DATA_NOTICE).toBe("Não registre informações de saúde ou dados sensíveis de terceiros.");
  });

  it("cada arquivo com <textarea> usa <SensitiveDataNotice /> (ou está justificado na lista)", () => {
    const root = process.cwd();
    const files = tsxFiles(join(root, "src")).map((f) => f.slice(root.length + 1).split(String.fromCharCode(92)).join("/"));
    const withTextarea = files.filter((f) => readFileSync(join(root, f), "utf8").includes("<textarea"));
    expect(withTextarea.length).toBeGreaterThanOrEqual(8); // sanidade: o varredor achou os campos
    const missing = withTextarea.filter((f) => !(f in NOT_THIRD_PARTY_DATA) && !readFileSync(join(root, f), "utf8").includes("<SensitiveDataNotice"));
    expect(missing, `campos livres sem o aviso padrao: ${missing.join(", ")}`).toEqual([]);
  });

  it("o texto antigo (\"... dados sensíveis do cliente\") não sobrou em nenhum lugar", () => {
    const root = process.cwd();
    const stale = tsxFiles(join(root, "src")).filter((f) => readFileSync(f, "utf8").includes("dados sensíveis do cliente"));
    expect(stale).toEqual([]);
  });
});
