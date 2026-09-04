import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { OnboardingWizard } from "./OnboardingWizard";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (business?.onboardingCompleted) {
    redirect("/dashboard");
  }

  return (
    <OnboardingWizard
      initialStep={business?.onboardingStep ?? 1}
      initialData={{
        businessType: business?.businessType ?? null,
        revenueModel: business?.revenueModel ?? [],
        revenueModelOther: business?.revenueModelOther ?? "",
        name: business?.name ?? "",
        yearsInBusiness: business?.yearsInBusiness ?? null,
        employeeCount: business?.employeeCount ? String(business.employeeCount) : "",
        currency: business?.currency ?? null,
        averageMonthlyRevenue: business?.averageMonthlyRevenue?.toString() ?? "",
      }}
    />
  );
}
