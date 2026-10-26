import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { previewImport } from "@/lib/finance/importPreview";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Selecione um arquivo para importar." }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  const format = name.endsWith(".csv") ? "csv" : name.endsWith(".xlsx") ? "xlsx" : null;
  if (!format) {
    return NextResponse.json(
      { error: "Formato de arquivo não suportado. Envie um arquivo .csv ou .xlsx." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await previewImport(business.id, business.currency, business.timezone, buffer, format);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
