import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/cookies";
import { isReacceptEnabled, acceptancePending } from "@/lib/legal/acceptance";
import { summarizeChanges, type VersionChange } from "@/content/legal/changes";
import { LEGAL_PATHS, PRIVACY_POLICY_VERSION, TERMS_VERSION } from "@/content/legal/meta";
import { AuthCard } from "@/components/AuthCard";
import { ReacceptForm } from "./ReacceptForm";

// Titulo da aba/janela (WCAG 2.4.2): descreve a pagina; o sufixo vem do template do layout raiz.
export const metadata = { title: "Documentos atualizados" };

function ChangeList({ title, href, version, changes }: { title: string; href: string; version: string; changes: VersionChange[] }) {
  if (changes.length === 0) return null;
  return (
    <section className="mt-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
        {title} <span className="font-normal text-gray-500 dark:text-neutral-400">(versão {version})</span>
      </h2>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-neutral-300">
        {changes.flatMap((change) => change.summary.map((line) => <li key={`${change.version}-${line}`}>{line}</li>))}
      </ul>
      <Link href={href} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm font-medium text-gray-900 underline dark:text-neutral-100">
        Ler o texto completo
      </Link>
    </section>
  );
}

// Reaceite dos documentos legais, ANTES de acessar o app (guards e rotas redirecionam para ca
// quando ha aceite pendente - src/lib/legal/acceptance.ts). Fica fora do route group (app): sem
// barra lateral, so o resumo do que mudou, os links, a caixa de aceite e a saida (logout).
export default async function ReacceptPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Nada a aceitar (ou mecanismo desligado): segue para o app.
  if (!isReacceptEnabled() || !acceptancePending(user)) redirect("/dashboard");

  const summary = summarizeChanges(user);

  return (
    <AuthCard title="Documentos atualizados" subtitle="Aceite para continuar usando o serviço" brand="static">
      <p className="text-sm text-gray-700 dark:text-neutral-300">
        {summary.firstAcceptance
          ? "Ainda não temos o registro do seu aceite dos Termos de Serviço e da Política de Privacidade. Leia os documentos e aceite para continuar."
          : "Atualizamos os documentos abaixo desde o seu último aceite. Veja o que mudou:"}
      </p>
      <ChangeList title="Termos de Serviço" href={LEGAL_PATHS.terms} version={TERMS_VERSION} changes={summary.terms} />
      <ChangeList title="Política de Privacidade" href={LEGAL_PATHS.privacy} version={PRIVACY_POLICY_VERSION} changes={summary.privacy} />
      <ReacceptForm />
    </AuthCard>
  );
}
