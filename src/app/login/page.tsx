import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/cookies";
import { AuthCard } from "@/components/AuthCard";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <AuthCard title="Entrar" subtitle="Acesse sua conta">
      <LoginForm />
    </AuthCard>
  );
}
