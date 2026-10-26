import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { confirmImport, type ImportRowInput } from "@/lib/finance/importConfirm";
import { previewImport } from "@/lib/finance/importPreview";

// Etapa F3c: importacao no FUSO DA EMPRESA. Duplicata = mesmo dia de
// calendario NESSE fuso (antes: getters locais, fuso do processo). Instantes
// fixos em UTC: o resultado e o mesmo com o processo em UTC, Asia/Tokyo ou
// America/New_York.
describe("importação e duplicatas no fuso da empresa (Etapa F3c)", () => {
  const created: { userId: string; businessId: string }[] = [];
  let revenueCategoryId: string;

  async function makeBusiness(timezone: string, country: string) {
    const user = await prisma.user.create({
      data: {
        name: `Importacao ${timezone}`,
        email: `import-tz-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    const business = await prisma.business.create({ data: { userId: user.id, name: `Empresa ${timezone}`, currency: "BRL", timezone, country } });
    created.push({ userId: user.id, businessId: business.id });
    return { userId: user.id, businessId: business.id };
  }

  // Lancamento IMPORT ja gravado num instante arbitrario (ex.: por um
  // servidor em outro fuso, antes desta etapa).
  async function existingImport(businessId: string, userId: string, occurredAtIso: string, description = "Venda balcão") {
    await prisma.financialEntry.create({
      data: { businessId, userId, type: "REVENUE", categoryId: revenueCategoryId, description, amount: "500", occurredAt: new Date(occurredAtIso), source: "IMPORT" },
    });
  }

  function csv(date: string, description = "Venda balcão") {
    return Buffer.from(`data,tipo,categoria,descricao,valor\n${date},receita,Venda de produtos,${description},500\n`, "utf-8");
  }

  function row(date: string, description = "Venda balcão"): ImportRowInput {
    return { rowNumber: 2, data: date, tipo: "receita", categoria: "Venda de produtos", descricao: description, valor: "500", observacao: "" };
  }

  beforeAll(async () => {
    revenueCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE", name: "Venda de produtos" } })).id;
  });

  afterAll(async () => {
    const ids = created.map((c) => c.businessId);
    await prisma.financialEntry.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.category.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: created.map((c) => c.userId) } } });
  });

  it("empresa Tóquio: grava 00:00 JST (15:00Z do dia anterior), o mesmo valor de antes com o servidor em Tóquio", async () => {
    const { businessId, userId } = await makeBusiness("Asia/Tokyo", "JP");
    const result = await confirmImport(businessId, userId, "BRL", "Asia/Tokyo", [row("2026-10-20")], "import_anyway");
    expect(result.inserted).toBe(1);
    const stored = await prisma.financialEntry.findFirstOrThrow({ where: { businessId, source: "IMPORT" } });
    expect(stored.occurredAt.toISOString()).toBe("2026-10-19T15:00:00.000Z");
  });

  it("empresa Tóquio, madrugada JST: lançamento já importado às 00:00 JST de 20/10 (15:00Z de 19/10) é duplicata de '2026-10-20' - com o processo em UTC o código antigo comparava pelo dia UTC (19/10) e não detectava", async () => {
    const { businessId, userId } = await makeBusiness("Asia/Tokyo", "JP");
    await existingImport(businessId, userId, "2026-10-19T15:00:00Z"); // 20/10 00:00 JST
    await existingImport(businessId, userId, "2026-10-20T00:00:00Z", "Gravado por servidor UTC"); // 20/10 09:00 JST
    await existingImport(businessId, userId, "2026-10-20T15:00:00Z", "Já é 21/10"); // 21/10 00:00 JST

    const preview = await previewImport(
      businessId,
      "BRL",
      "Asia/Tokyo",
      Buffer.from(
        "data,tipo,categoria,descricao,valor\n" +
          "2026-10-20,receita,Venda de produtos,Venda balcão,500\n" +
          "20/10/2026,receita,Venda de produtos,Gravado por servidor UTC,500\n" +
          "2026-10-20,receita,Venda de produtos,Já é 21/10,500\n",
        "utf-8"
      ),
      "csv"
    );
    if (!preview.ok) throw new Error(preview.error);
    expect(preview.rows.map((r) => r.isDuplicate)).toEqual([true, true, false]);

    const result = await confirmImport(businessId, userId, "BRL", "Asia/Tokyo", [row("2026-10-20")], "skip");
    expect(result.skippedDuplicates).toBe(1);
    expect(result.inserted).toBe(0);
  });

  it("empresa São Paulo: grava 00:00 de SP e a duplicata é pelo dia de SP (23:59 de 19/10 em SP não é duplicata de 20/10)", async () => {
    const { businessId, userId } = await makeBusiness("America/Sao_Paulo", "BR");
    const first = await confirmImport(businessId, userId, "BRL", "America/Sao_Paulo", [row("20/10/2026")], "import_anyway");
    expect(first.inserted).toBe(1);
    const stored = await prisma.financialEntry.findFirstOrThrow({ where: { businessId, source: "IMPORT" } });
    expect(stored.occurredAt.toISOString()).toBe("2026-10-20T03:00:00.000Z");

    // Reimportar o mesmo arquivo: duplicata.
    const again = await previewImport(businessId, "BRL", "America/Sao_Paulo", csv("2026-10-20"), "csv");
    if (!again.ok) throw new Error(again.error);
    expect(again.duplicateCount).toBe(1);

    // 02:59Z de 20/10 = 19/10 23:59 em SP (mas já 20/10 em Tóquio/UTC).
    await existingImport(businessId, userId, "2026-10-20T02:59:00Z", "Fim do dia 19");
    const sp = await previewImport(businessId, "BRL", "America/Sao_Paulo", csv("2026-10-20", "Fim do dia 19"), "csv");
    if (!sp.ok) throw new Error(sp.error);
    expect(sp.duplicateCount).toBe(0);
    const spPrevDay = await previewImport(businessId, "BRL", "America/Sao_Paulo", csv("2026-10-19", "Fim do dia 19"), "csv");
    if (!spPrevDay.ok) throw new Error(spPrevDay.error);
    expect(spPrevDay.duplicateCount).toBe(1);
  });

  it("empresa UTC: grava 00:00Z e a duplicata é pelo dia UTC", async () => {
    const { businessId, userId } = await makeBusiness("UTC", "GB");
    await confirmImport(businessId, userId, "BRL", "UTC", [row("2026-10-20")], "import_anyway");
    const stored = await prisma.financialEntry.findFirstOrThrow({ where: { businessId, source: "IMPORT" } });
    expect(stored.occurredAt.toISOString()).toBe("2026-10-20T00:00:00.000Z");

    // 15:00Z de 19/10 (00:00 JST de 20/10) é 19/10 para a empresa em UTC.
    await existingImport(businessId, userId, "2026-10-19T15:00:00Z", "Tóquio meia-noite");
    const preview = await previewImport(businessId, "BRL", "UTC", csv("2026-10-20", "Tóquio meia-noite"), "csv");
    if (!preview.ok) throw new Error(preview.error);
    expect(preview.duplicateCount).toBe(0);
  });
});
