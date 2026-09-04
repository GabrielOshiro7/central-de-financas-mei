import { requireOnboardedUser } from "@/lib/auth/guards";
import { ProfileForm } from "./ProfileForm";
import { ChangePasswordForm } from "./ChangePasswordForm";

export default async function ConfiguracoesPage() {
  const { user } = await requireOnboardedUser();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Configurações</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400">Gerencie sua conta.</p>
      </div>

      <ProfileForm user={user} />
      <ChangePasswordForm />
    </div>
  );
}
