import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { confirmImport } from "@/lib/finance/importConfirm";

const categoryDecisionSchema = z.discriminatedUnion("action", [
  z.object({ key: z.string().min(1), action: z.literal("create") }),
  z.object({ key: z.string().min(1), action: z.literal("map"), mapToCategoryId: z.string().min(1) }),
]);

const confirmSchema = z.object({
  duplicateAction: z.enum(["skip", "import_anyway"]),
  categoryDecisions: z.array(categoryDecisionSchema).default([]),
  rows: z
    .array(
      z.object({
        rowNumber: z.number().int(),
        data: z.string().default(""),
        tipo: z.string().default(""),
        categoria: z.string().default(""),
        descricao: z.string().default(""),
        valor: z.string().default(""),
        observacao: z.string().default(""),
      })
    )
    .min(1, "Nenhum lançamento para importar."),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  const result = await confirmImport(
    business.id,
    user.id,
    business.currency,
    parsed.data.rows,
    parsed.data.duplicateAction,
    parsed.data.categoryDecisions
  );

  return NextResponse.json(result);
}
