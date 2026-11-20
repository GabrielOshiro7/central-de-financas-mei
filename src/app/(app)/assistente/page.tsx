import { requireOnboardedUser } from "@/lib/auth/guards";
import { AssistantPanel } from "@/components/dashboard/AssistantPanel";
import { InformationalNotice } from "@/components/legal/InformationalNotice";

// Titulo da aba/janela (WCAG 2.4.2): descreve a pagina; o sufixo vem do template do layout raiz.
export const metadata = { title: "Assistente" };

export default async function AssistentePage() {
  await requireOnboardedUser();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Assistente</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          Estrutura preparada para a assistente de IA financeira das próximas etapas.
        </p>
      </div>

      <AssistantPanel />

      <InformationalNotice />
    </div>
  );
}
