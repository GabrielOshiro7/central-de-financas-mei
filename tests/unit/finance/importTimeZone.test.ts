import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import type { Category } from "@prisma/client";
import { validateImportRow } from "@/lib/finance/importValidation";
import { parseXlsxBuffer } from "@/lib/finance/importParsing";

// Etapa F3c: a data de cada linha importada e interpretada no FUSO DA EMPRESA
// (00:00 do dia nesse fuso), nunca no do processo. Valores esperados fixos
// em UTC: o resultado e o mesmo com o processo em UTC, Asia/Tokyo ou
// America/New_York (matriz da F3c).
const categories = [
  { id: "rev-1", businessId: null, name: "Venda de produtos", normalizedName: "venda de produtos", type: "REVENUE", isDefault: true, active: true, createdAt: new Date() },
] as Category[];

function occurredAt(data: string, timeZone: string): string | null {
  const row = validateImportRow(
    { data, tipo: "receita", categoria: "Venda de produtos", descricao: "Linha", valor: "100", observacao: "" },
    2,
    categories,
    "BRL",
    timeZone
  );
  return row.occurredAt?.toISOString() ?? null;
}

describe("data da importação no fuso da empresa", () => {
  it("empresa Tóquio: mesmos instantes que o código anterior gravava com o servidor em Tóquio (regra de ouro)", () => {
    // Valores capturados do commit anterior (e1b440d) com o processo em
    // Asia/Tokyo: 00:00 JST = 15:00Z do dia anterior.
    expect(occurredAt("2026-10-20", "Asia/Tokyo")).toBe("2026-10-19T15:00:00.000Z");
    expect(occurredAt("20/10/2026", "Asia/Tokyo")).toBe("2026-10-19T15:00:00.000Z");
    expect(occurredAt("1/2/2026", "Asia/Tokyo")).toBe("2026-01-31T15:00:00.000Z");
    expect(occurredAt("2026-10-20T23:30:00", "Asia/Tokyo")).toBe("2026-10-19T15:00:00.000Z");
    expect(occurredAt("2026-02-31", "Asia/Tokyo")).toBe("2026-03-02T15:00:00.000Z"); // ISO fora do intervalo normaliza, como antes
    expect(occurredAt("29/02/2028", "Asia/Tokyo")).toBe("2028-02-28T15:00:00.000Z");
    expect(occurredAt("2027-01-01", "Asia/Tokyo")).toBe("2026-12-31T15:00:00.000Z");
  });

  it("empresa São Paulo e UTC: 00:00 do dia no fuso de cada uma", () => {
    expect(occurredAt("2026-10-20", "America/Sao_Paulo")).toBe("2026-10-20T03:00:00.000Z");
    expect(occurredAt("20/10/2026", "America/Sao_Paulo")).toBe("2026-10-20T03:00:00.000Z");
    expect(occurredAt("2026-10-20", "UTC")).toBe("2026-10-20T00:00:00.000Z");
    expect(occurredAt("31/12/2026", "UTC")).toBe("2026-12-31T00:00:00.000Z");
  });

  it("datas BR inexistentes continuam inválidas em qualquer fuso", () => {
    for (const tz of ["Asia/Tokyo", "America/Sao_Paulo", "UTC"]) {
      expect(occurredAt("31/02/2026", tz)).toBeNull();
      expect(occurredAt("00/10/2026", tz)).toBeNull();
      expect(occurredAt("10/13/2026", tz)).toBeNull();
      expect(occurredAt("29/02/2027", tz)).toBeNull();
    }
  });

  it("célula de data do Excel: o dia da planilha (componentes UTC), independente do fuso", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Lancamentos");
    ws.addRow(["data", "tipo", "categoria", "descricao", "valor"]);
    ws.addRow([new Date(Date.UTC(2026, 9, 20)), "receita", "Venda de produtos", "A", 1]);
    ws.addRow([new Date(Date.UTC(2026, 9, 31, 23, 30)), "receita", "Venda de produtos", "B", 1]);
    const parsed = await parseXlsxBuffer(Buffer.from(await wb.xlsx.writeBuffer()));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.rows.map((r) => r.data)).toEqual(["2026-10-20", "2026-10-31"]);
  });
});
