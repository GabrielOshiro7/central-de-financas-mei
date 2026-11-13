import Link from "next/link";
import { LEGAL_PATHS } from "@/content/legal/meta";

// Links para os documentos legais (rodape da landing, telas de login/cadastro/recuperacao,
// Configuracoes e as proprias paginas legais). `newTab`: abre em nova aba (ex.: no
// cadastro, para nao perder o formulario).
export function LegalLinks({
  className = "",
  linkClassName = "",
  newTab = false,
  align = "center",
}: {
  className?: string;
  linkClassName?: string;
  newTab?: boolean;
  align?: "start" | "center";
}) {
  const target = newTab ? { target: "_blank", rel: "noopener noreferrer" } : {};
  const link = `hover:underline ${linkClassName}`;
  return (
    <nav aria-label="Documentos legais" className={`flex flex-wrap items-center ${align === "center" ? "justify-center" : "justify-start"} gap-x-4 gap-y-1 text-xs ${className}`}>
      <Link href={LEGAL_PATHS.privacy} className={link} {...target}>
        Privacidade
      </Link>
      <Link href={LEGAL_PATHS.terms} className={link} {...target}>
        Termos
      </Link>
      <Link href={LEGAL_PATHS.cookies} className={link} {...target}>
        Cookies
      </Link>
    </nav>
  );
}
