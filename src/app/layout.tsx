import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "@/components/ThemeProvider";
import { HydrationMarker } from "@/components/HydrationMarker";
import "./globals.css";

// Lido antes da hidratação (precisa ser `beforeInteractive`, que só é
// permitido no root layout): reflete `sidebar-collapsed` (localStorage) no
// atributo `data-sidebar-collapsed` da <html>, que é o que o CSS usa pra
// resolver --sidebar-w (ver globals.css e src/components/nav/Sidebar.tsx) -
// sem isso a sidebar nasceria sempre expandida por um instante e "pularia"
// pra recolhida no primeiro client-render. Inofensivo fora do app
// autenticado (landing/login/onboarding não têm sidebar, então o atributo
// não afeta nada ali). Uma tag <script> "crua" via dangerouslySetInnerHTML
// direto no JSX do layout dispara o aviso do React "Encountered a script
// tag while rendering..." — next/script com beforeInteractive é o
// mecanismo suportado para isso.
const SIDEBAR_INIT_SCRIPT =
  "try{if(localStorage.getItem('sidebar-collapsed')==='true'){document.documentElement.setAttribute('data-sidebar-collapsed','true')}}catch(e){}";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nome do Sistema",
  description: "Seu sistema de gestão empresarial",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning: extensões de navegador (ex.: ColorZilla)
          injetam atributos no <body> (ex.: cz-shortcut-listen) antes da
          hidratação - React acusaria mismatch nesse atributo específico
          mesmo sem nenhum bug real de hydration no app. Só suprime o aviso
          NESTE elemento, não propaga pra árvore abaixo.

          Limitação de ambiente conhecida (investigada na Etapa 8, não
          corrigida): algumas extensões de navegador também chegam a
          reestruturar o DOM (não só atributos) antes da hidratação
          terminar, o que produz "NotFoundError: Failed to execute
          'removeChild' on 'Node': The node to be removed is not a child of
          this node" durante a reconciliação do React - suppressHydrationWarning
          não previne isso (só silencia o aviso de mismatch de atributo/texto,
          nunca uma exceção real de estrutura). Confirmado por reprodução:
          NÃO ocorre em janela anônima/perfil limpo (sem extensões) e NÃO foi
          reproduzido em 15 recargas de /dashboard + 5 outras páginas via
          Chromium headless sem extensões - só em navegador normal, com
          extensões instaladas. Mesma classe de problema do caso ColorZilla
          acima, só que estrutural em vez de só atributo. Não é bug do app,
          não bloqueia o uso normal do sistema, e não há fix de código que
          resolva de forma confiável (a extensão pode sempre alterar o DOM
          por fora do controle do React). */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <Script
          id="sidebar-init-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: SIDEBAR_INIT_SCRIPT }}
        />
        <ThemeProvider>{children}</ThemeProvider>
        <HydrationMarker />
      </body>
    </html>
  );
}
