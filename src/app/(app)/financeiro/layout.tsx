import type { ReactNode } from "react";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { listVisibleCategories } from "@/lib/finance/categories";
import { FinanceiroShell } from "@/components/financeiro/FinanceiroShell";

export default async function FinanceiroLayout({ children }: { children: ReactNode }) {
  const { business } = await requireOnboardedUser();
  const categories = await listVisibleCategories(business.id);

  return (
    <FinanceiroShell
      categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
      currency={business.currency}
    >
      {children}
    </FinanceiroShell>
  );
}
