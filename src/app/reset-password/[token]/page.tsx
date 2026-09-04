import { AuthCard } from "@/components/AuthCard";
import { ResetPasswordForm } from "./ResetPasswordForm";

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
