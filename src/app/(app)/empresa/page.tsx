import { redirect } from "next/navigation";

// Titulo da aba/janela (WCAG 2.4.2): descreve a pagina; o sufixo vem do template do layout raiz.
export const metadata = { title: "Empresa" };

// "Minha empresa" deixou de ser item de nivel principal do menu (Etapa 5.1) -
// o formulario/conteudo mudou para a secao "Empresa" dentro de
// Configuracoes (ver EmpresaSection.tsx). Esta rota permanece como REDIRECT
// (nunca removida) para nao quebrar favoritos/historico de navegacao de quem
// ja usava o link direto - proxy.ts continua protegendo /empresa/:path* por
// sessao antes de chegar aqui.
export default function EmpresaPage() {
  redirect("/configuracoes#empresa");
}
