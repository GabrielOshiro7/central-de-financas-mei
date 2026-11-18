import { AuthCard } from "@/components/AuthCard";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

// Titulo da aba/janela (WCAG 2.4.2): descreve a pagina; o sufixo vem do template do layout raiz.
export const metadata = { title: "Recuperar senha" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Recuperar senha" subtitle="Enviaremos um link para o seu e-mail">
      <ForgotPasswordForm />
    </AuthCard>
  );
}
