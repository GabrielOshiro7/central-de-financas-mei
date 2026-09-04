import { NextResponse } from "next/server";
import { Prisma, type BusinessType, type Currency, type YearsInBusiness } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import {
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
  step6Schema,
  TOTAL_STEPS,
} from "@/lib/onboarding/schema";

const { Decimal } = Prisma;

// Campos que este endpoint efetivamente atribui - sempre valores literais,
// nunca operacoes tipo { increment: 1 }. Um tipo proprio (em vez de
// Prisma.BusinessUpdateInput) evita o atrito entre os inputs de create/update
// do Prisma, que aceitam formas diferentes para o mesmo campo.
type BusinessFields = Partial<{
  businessType: BusinessType;
  revenueModel: string[];
  revenueModelOther: string | null;
  name: string;
  yearsInBusiness: YearsInBusiness;
  employeeCount: number;
  currency: Currency;
  averageMonthlyRevenue: InstanceType<typeof Decimal>;
}>;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const step = Number((body as { step?: unknown } | null)?.step);
  const data = (body as { data?: unknown } | null)?.data;

  if (!Number.isInteger(step) || step < 1 || step > TOTAL_STEPS) {
    return NextResponse.json({ error: "Passo inválido." }, { status: 400 });
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  const currentStep = business?.onboardingStep ?? 1;

  if (step > currentStep) {
    return NextResponse.json(
      { error: "Responda os passos anteriores primeiro." },
      { status: 400 }
    );
  }

  const fields: BusinessFields = {};

  switch (step) {
    case 1: {
      const parsed = step1Schema.safeParse(data);
      if (!parsed.success) {
        return NextResponse.json({ error: firstIssue(parsed) }, { status: 400 });
      }
      fields.businessType = parsed.data.businessType;
      // Se o tipo de negocio mudou, o modelo de receita antigo pode nao
      // fazer mais sentido - reseta para o usuario responder de novo.
      if (business && business.businessType !== parsed.data.businessType) {
        fields.revenueModel = [];
        fields.revenueModelOther = null;
      }
      break;
    }
    case 2: {
      if (!business?.businessType) {
        return NextResponse.json(
          { error: "Responda os passos anteriores primeiro." },
          { status: 400 }
        );
      }
      const parsed = step2Schema(business.businessType).safeParse(data);
      if (!parsed.success) {
        return NextResponse.json({ error: firstIssue(parsed) }, { status: 400 });
      }
      if ("revenueModelOther" in parsed.data && !("revenueModel" in parsed.data)) {
        fields.revenueModel = [];
        fields.revenueModelOther = parsed.data.revenueModelOther;
      } else if ("revenueModel" in parsed.data) {
        fields.revenueModel = parsed.data.revenueModel;
        fields.revenueModelOther = parsed.data.revenueModelOther ?? null;
      }
      break;
    }
    case 3: {
      const parsed = step3Schema.safeParse(data);
      if (!parsed.success) {
        return NextResponse.json({ error: firstIssue(parsed) }, { status: 400 });
      }
      fields.name = parsed.data.name;
      break;
    }
    case 4: {
      const parsed = step4Schema.safeParse(data);
      if (!parsed.success) {
        return NextResponse.json({ error: firstIssue(parsed) }, { status: 400 });
      }
      fields.yearsInBusiness = parsed.data.yearsInBusiness;
      break;
    }
    case 5: {
      const parsed = step5Schema.safeParse(data);
      if (!parsed.success) {
        return NextResponse.json({ error: firstIssue(parsed) }, { status: 400 });
      }
      fields.employeeCount = parsed.data.employeeCount;
      break;
    }
    case 6: {
      const parsed = step6Schema.safeParse(data);
      if (!parsed.success) {
        return NextResponse.json({ error: firstIssue(parsed) }, { status: 400 });
      }
      fields.currency = parsed.data.currency;
      fields.averageMonthlyRevenue = new Decimal(parsed.data.averageMonthlyRevenue);
      break;
    }
  }

  const newOnboardingStep = Math.max(currentStep, step + 1);

  const updated = await prisma.business.upsert({
    where: { userId: user.id },
    create: { userId: user.id, onboardingStep: newOnboardingStep, ...fields },
    update: { onboardingStep: newOnboardingStep, ...fields },
  });

  return NextResponse.json({
    onboardingStep: updated.onboardingStep,
    totalSteps: TOTAL_STEPS,
  });
}

function firstIssue(parsed: { success: false; error: { issues: { message: string }[] } }): string {
  return parsed.error.issues[0]?.message ?? "Dados inválidos.";
}
