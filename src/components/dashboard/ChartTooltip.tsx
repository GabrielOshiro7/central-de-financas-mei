"use client";

import type { ReactNode } from "react";

export type TooltipAnchor =
  | { placement: "right"; left: number; top: number }
  | { placement: "left"; right: number; top: number };

// Posicao do tooltip a partir do retangulo do elemento que disparou o
// hover/toque/foco (secao 3 do pedido de tooltips dos graficos da Etapa 4):
// se nao houver espaco suficiente a direita do elemento pra caber o
// tooltip, ele abre pra esquerda em vez de ser cortado pela borda da tela.
// `position: fixed` (no ChartTooltip abaixo) e relativo ao viewport, entao
// isso funciona corretamente mesmo dentro de containers com overflow
// (ex.: o grafico de barras rola horizontalmente).
export function computeTooltipAnchor(rect: DOMRect, estimatedWidth = 240): TooltipAnchor {
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  const spaceRight = viewportWidth - rect.left;
  if (spaceRight < estimatedWidth) {
    return { placement: "left", right: viewportWidth - rect.right, top: rect.top };
  }
  return { placement: "right", left: rect.left, top: rect.top };
}

// Tooltip visual compartilhado pelos graficos do dashboard (FinancialChart,
// TrendMiniChart). `pointer-events-none` pra nao atrapalhar o mouse/toque no
// elemento que o disparou. Os valores tambem ficam disponiveis via
// aria-label no proprio elemento disparador (nao dependem so deste tooltip
// visual) - ver comentario de acessibilidade em cada grafico.
export function ChartTooltip({ anchor, children }: { anchor: TooltipAnchor | null; children: ReactNode }) {
  if (!anchor) return null;

  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 max-w-xs -translate-y-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 shadow-lg dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
      style={{
        top: Math.max(8, anchor.top - 8),
        left: anchor.placement === "right" ? anchor.left : undefined,
        right: anchor.placement === "left" ? anchor.right : undefined,
      }}
    >
      {children}
    </div>
  );
}
