import { AuthCard } from "@/components/AuthCard";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Recuperar senha" subtitle="Enviaremos um link para o seu e-mail">
      <ForgotPasswordForm />
    </AuthCard>
  );
}
