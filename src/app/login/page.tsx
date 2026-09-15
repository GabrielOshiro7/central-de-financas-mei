import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/cookies";
import { AuthCard } from "@/components/AuthCard";
import { LoginForm } from "./LoginForm";

const SESSION_MESSAGES: Record<string, string> = {
  inactivity: "Sua sessão expirou por inatividade. Faça login novamente.",
  expired: "Sua sessão expirou. Faça login novamente.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  const searchParams = await props.searchParams;
  const reason = typeof searchParams.reason === "string" ? searchParams.reason : undefined;
  const sessionMessage = reason ? SESSION_MESSAGES[reason] : undefined;

  return (
    <AuthCard title="Entrar" subtitle="Acesse sua conta">
      <LoginForm sessionMessage={sessionMessage} />
    </AuthCard>
  );
}
