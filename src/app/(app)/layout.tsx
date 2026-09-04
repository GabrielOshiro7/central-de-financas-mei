import type { ReactNode } from "react";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { AppNav } from "@/components/nav/AppNav";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { business } = await requireOnboardedUser();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950">
      <AppNav businessName={business.name ?? "Minha empresa"} />
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
