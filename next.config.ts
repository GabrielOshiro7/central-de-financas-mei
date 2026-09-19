import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Default é bottom-left, que colide com os controles fixos do rodapé da
  // Sidebar (tema/Sair/recolher) nessa esquina; top-right colide com o botão
  // "Sair" fixo do onboarding (OnboardingWizard.tsx). bottom-right é a única
  // esquina sem nenhum elemento fixo hoje (só afeta o dev overlay, não
  // existe em produção, mas quebrava cliques nos testes E2E, que rodam
  // contra `next dev`).
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;
