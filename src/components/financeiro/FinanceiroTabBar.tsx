"use client";

import { type ReactNode, useEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const FINANCEIRO_TABS = [
  { href: "/financeiro/receitas", label: "Receitas" },
  { href: "/financeiro/custos", label: "Custos" },
  { href: "/financeiro/despesas", label: "Despesas" },
  { href: "/financeiro/pagar", label: "Contas a pagar" },
  { href: "/financeiro/receber", label: "Contas a receber" },
  { href: "/financeiro/recorrentes", label: "Recorrentes" },
  { href: "/financeiro/importar", label: "Importação" },
] as const;

/** A barra só ganha fundo/borda depois deste tanto de rolagem da página. */
export const SCROLLED_THRESHOLD_PX = 8;

/**
 * "A página já rolou?" como external store (mesmo molde do `collapsed` da
 * Sidebar): o React só re-renderiza quando o booleano muda, não a cada pixel
 * rolado, e o snapshot do servidor (`false`) evita mismatch de hidratação.
 * O listener é passive e agrupado por requestAnimationFrame.
 */
function subscribeScrolled(listener: () => void) {
  let frame = 0;
  const onScroll = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      listener();
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    window.removeEventListener("scroll", onScroll);
    if (frame) cancelAnimationFrame(frame);
  };
}

function getScrolledSnapshot() {
  return window.scrollY > SCROLLED_THRESHOLD_PX;
}

function getScrolledServerSnapshot() {
  return false;
}

/**
 * Marca no próprio elemento (data-fade-start/-end) se há abas cortadas à
 * esquerda/direita - o CSS em globals.css usa isso pra esmaecer a borda
 * correspondente. Escreve direto no DOM, sem estado React: é puramente visual
 * e mudaria a cada evento de rolagem horizontal.
 */
function syncEdgeFades(scroller: HTMLElement) {
  const maxScroll = scroller.scrollWidth - scroller.clientWidth;
  scroller.dataset.fadeStart = String(scroller.scrollLeft > 1);
  scroller.dataset.fadeEnd = String(scroller.scrollLeft < maxScroll - 1);
}

/**
 * Barra de navegação do módulo Financeiro. Fica presa no topo ao rolar
 * (sticky) e nasce integrada ao fundo da página; o fundo/borda vivem num
 * elemento separado (.subnav-backdrop) que sangra até as bordas do <main>
 * (ver `overflow-x-clip` em (app)/layout.tsx), enquanto as abas continuam
 * alinhadas à coluna de conteúdo.
 */
export function FinanceiroTabBar({ action }: { action?: ReactNode }) {
  const pathname = usePathname();
  const scrolled = useSyncExternalStore(subscribeScrolled, getScrolledSnapshot, getScrolledServerSnapshot);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const sync = () => syncEdgeFades(scroller);
    sync();
    scroller.addEventListener("scroll", sync, { passive: true });
    // jsdom (testes de componente) não tem ResizeObserver.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
    observer?.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", sync);
      observer?.disconnect();
    };
  }, []);

  // Em tela estreita a aba ativa pode estar fora da área visível da barra.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const active = scroller?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!scroller || !active) return;
    const margin = 32;
    const start = active.offsetLeft - margin;
    const end = active.offsetLeft + active.offsetWidth + margin;
    if (start < scroller.scrollLeft) scroller.scrollLeft = Math.max(0, start);
    else if (end > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = end - scroller.clientWidth;
  }, [pathname]);

  return (
    <div
      data-scrolled={scrolled}
      className="subnav sticky top-0 z-30 -mx-6 -mt-6 flex items-center gap-4 border-b border-gray-300 px-6 dark:border-neutral-700"
    >
      {/* Linha separadora fixa (border-b da barra) entre as abas e o
          conteúdo. O backdrop desce 1px (-bottom-px) pra que a borda dele,
          que só aparece ao rolar e sangra até as bordas do <main>, caia
          exatamente em cima dessa linha, na mesma cor - sem linha dupla. */}
      <div
        aria-hidden="true"
        className="subnav-backdrop pointer-events-none absolute -inset-x-[100vw] top-0 -bottom-px -z-10 border-b border-gray-300 bg-[#FAF9F6]/85 shadow-xs backdrop-blur dark:border-neutral-700 dark:bg-neutral-950/85 dark:shadow-none"
      />
      <nav aria-label="Seções do Financeiro" className="min-w-0 flex-1">
        {/* justify-between espalha as abas na largura toda quando cabem;
            quando não cabem (tela estreita), o espaço livre fica negativo e o
            navegador volta a alinhar no início - a rolagem horizontal com
            esmaecimento continua igual. */}
        <div ref={scrollerRef} className="subnav-scroller relative flex justify-between gap-5 overflow-x-auto">
          {FINANCEIRO_TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                data-label={tab.label}
                className={`subnav-link inline-flex shrink-0 flex-col items-center border-b-2 py-3 text-sm whitespace-nowrap ${
                  active
                    ? "border-ember font-semibold text-gray-900 dark:text-neutral-100"
                    : "border-transparent font-medium text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
      {action}
    </div>
  );
}
