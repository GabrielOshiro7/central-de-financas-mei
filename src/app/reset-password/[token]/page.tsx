import { AuthCard } from "@/components/AuthCard";
import { ResetPasswordForm } from "./ResetPasswordForm";

// Titulo da aba/janela (WCAG 2.4.2): descreve a pagina; o sufixo vem do template do layout raiz.
export const metadata = { title: "Nova senha" };

export default async function ResetPasswordPage(
  props: PageProps<"/reset-password/[token]">
) {
  const { token } = await props.params;

  return (
    <AuthCard title="Redefinir senha" subtitle="Escolha uma nova senha">
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
