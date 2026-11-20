import { INFORMATIONAL_NOTICE } from "@/content/legal/meta";

// Aviso de caráter informativo, discreto (texto pequeno, cor neutra - sem cor de status), no
// rodape de Insights, Assistente e Dashboard. O texto e a constante unica INFORMATIONAL_NOTICE.
export function InformationalNotice() {
  return (
    <p data-informational-notice="" className="text-xs text-gray-500 dark:text-neutral-400">
      {INFORMATIONAL_NOTICE}
    </p>
  );
}
