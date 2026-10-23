import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // So o servidor do Playwright define NEXT_DIST_DIR (".next-test"): dois
  // `next dev` nao compartilham a mesma pasta de build (lock em .next/dev).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Permite acessar o dev server via IP da LAN (ex.: celular testando touch)
  // - sem isso o Next 16 bloqueia em silêncio requisições cross-origin a
  // recursos internos de dev (HMR, navegação RSC), então o login parecia
  // "não autenticar" sem nenhum erro visível.
  allowedDevOrigins: ["192.168.0.233"],
  // Default é bottom-left, que colide com os controles fixos do rodapé da
  // Sidebar (tema/Sair/recolher) nessa esquina; top-right colide com o botão
  // "Sair" fixo do onboarding (OnboardingWizard.tsx). bottom-right é a única
  // esquina sem nenhum elemento fixo hoje (só afeta o dev overlay, não
  // existe em produção, mas quebrava cliques nos testes E2E, que rodam
  // contra `next dev`).
  devIndicators: {
    position: "bottom-right",
  },
  // A aba "Visao geral" do Financeiro foi removida (o Dashboard ja mostra o
  // mesmo conteudo) - a raiz do modulo cai na primeira aba. Temporario (307)
  // de proposito: o destino pode mudar, e um 308 ficaria em cache no
  // navegador/CDN. A query string (ex.: ?period=LAST_MONTH) e repassada.
  async redirects() {
    return [{ source: "/financeiro", destination: "/financeiro/receitas", permanent: false }];
  },
};

export default nextConfig;
