import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/cookies";
import { AuthCard } from "@/components/AuthCard";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <AuthCard title="Criar conta" subtitle="Leva menos de um minuto">
      <RegisterForm />
    </AuthCard>
  );
}
