import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/cookies";
import { generateCsvTemplate, generateXlsxTemplate } from "@/lib/finance/templates";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const format = new URL(request.url).searchParams.get("format");

  if (format === "csv") {
    return new NextResponse(generateCsvTemplate(), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="template-lancamentos.csv"',
      },
    });
  }

  if (format === "xlsx") {
    const buffer = await generateXlsxTemplate();
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="template-lancamentos.xlsx"',
      },
    });
  }

  return NextResponse.json({ error: "Formato inválido. Use csv ou xlsx." }, { status: 400 });
}
