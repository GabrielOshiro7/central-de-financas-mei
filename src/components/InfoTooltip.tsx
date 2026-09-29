"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { CircleHelp } from "lucide-react";

type Align = "center" | "start" | "end";

const TOOLTIP_WIDTH_PX = 240;
const VIEWPORT_MARGIN_PX = 8;

// `"ontouchstart" in window` dá falso positivo em vários navegadores (e no
// próprio jsdom, que sempre define a propriedade) - maxTouchPoints é o sinal
// confiável de capacidade de toque real do dispositivo. Não muda depois do
// mount, então não há evento pra assinar - só precisamos ler o valor no
// cliente sem causar mismatch de hidratação (mesmo padrão de
// ThemeToggle.tsx/useHasMounted, via useSyncExternalStore em vez de
// setState dentro de um efeito).
function useIsTouchDevice(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => navigator.maxTouchPoints > 0,
    () => false
  );
}

/**
 * Ícone de ajuda com um balão explicativo, usado ao lado de títulos de
 * seção. Desktop: abre no hover ou no foco de teclado. Touch: não existe
 * hover, então o toque alterna aberto/fechado - o modo é decidido por
 * capacidade de toque real do dispositivo (maxTouchPoints), nunca por
 * largura de tela, já que um mesmo dispositivo pode ter mouse e tela touch
 * ao mesmo tempo.
 */
export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const isTouch = useIsTouchDevice();
  const [align, setAlign] = useState<Align>("center");
  const containerRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();

  // useLayoutEffect (não useEffect) para medir e corrigir o alinhamento
  // ANTES do navegador pintar o balão - com useEffect houve um frame visível
  // com o balão ainda centralizado (valor inicial) estourando a borda da
  // tela antes da correção, capturado em screenshot durante a verificação
  // manual desta feature.
  useLayoutEffect(() => {
    if (!open) return;

    const el = containerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      if (center - TOOLTIP_WIDTH_PX / 2 < VIEWPORT_MARGIN_PX) {
        setAlign("start");
      } else if (center + TOOLTIP_WIDTH_PX / 2 > window.innerWidth - VIEWPORT_MARGIN_PX) {
        setAlign("end");
      } else {
        setAlign("center");
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // Fecha ao tocar/clicar fora do balão - cobre o caso touch (onBlur não é
    // usado nesse modo) e reforça o caso desktop.
    function handleOutside(e: Event) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  const alignClass = align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2";

  return (
    <span ref={containerRef} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label="O que é isso?"
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={() => {
          if (!isTouch) setOpen(true);
        }}
        onMouseLeave={() => {
          if (!isTouch) setOpen(false);
        }}
        onFocus={() => {
          if (!isTouch) setOpen(true);
        }}
        onBlur={() => {
          if (!isTouch) setOpen(false);
        }}
        onClick={() => {
          if (isTouch) setOpen((o) => !o);
        }}
        className="inline-flex shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:text-neutral-500 dark:hover:text-neutral-300"
      >
        <CircleHelp size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`absolute top-full z-20 mt-2 w-60 max-w-[80vw] rounded-lg border border-gray-200 bg-white p-3 text-xs font-normal leading-relaxed text-gray-700 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 ${alignClass}`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
