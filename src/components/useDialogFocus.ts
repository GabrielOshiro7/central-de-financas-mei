"use client";

import { useEffect, useRef, type RefObject } from "react";

// Gerenciamento de foco de dialogos modais (padrao WAI-ARIA "Dialog (Modal)"), em um lugar so:
//  - ao ABRIR, o foco vai para dentro do dialogo (WCAG 2.4.3): se um campo ja pediu foco (autoFocus), fica
//    nele; senao o elemento com [data-autofocus], o primeiro campo/botao focavel, ou o proprio dialogo;
//  - Tab e Shift+Tab ficam PRESOS dentro dele enquanto aberto (2.1.2 + padrao do modal: o fundo e inerte);
//  - Esc fecha (2.1.1) - so o dialogo do TOPO reage, quando ha dialogos empilhados;
//  - ao FECHAR, o foco volta ao elemento que o abriu (2.4.3).
// Uso: const ref = useDialogFocus<HTMLDivElement>(open, onClose); <div role="dialog" ref={ref}>...
// `onClose` undefined = Esc nao fecha (ex.: enquanto uma requisicao esta em andamento).
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const openStack: symbol[] = [];

// Quem tinha o foco ANTES do dialogo abrir. O autoFocus do React move o foco para dentro do dialogo antes
// de qualquer effect rodar, entao `document.activeElement` no effect ja nao serve: guarda-se os dois
// ultimos elementos focados (o foco atual e o anterior).
let lastFocused: HTMLElement | null = null;
let previousFocused: HTMLElement | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target === lastFocused) return;
      previousFocused = lastFocused;
      lastFocused = target;
    },
    true
  );
}

function isVisible(el: HTMLElement): boolean {
  // checkVisibility (navegadores atuais) considera display:none/visibility de ancestrais; sem ele (jsdom), vale tudo.
  return typeof el.checkVisibility === "function" ? el.checkVisibility({ visibilityProperty: true }) : true;
}

function focusableIn(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isVisible);
}

export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose?: () => void): RefObject<T | null> {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  // Atualiza depois de cada render (nao durante o render): o Esc sempre chama o onClose mais recente.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const container = ref.current;
    if (!container) return;
    const id = Symbol("dialog");
    openStack.push(id);
    const opener = lastFocused && !container.contains(lastFocused) ? lastFocused : previousFocused && !container.contains(previousFocused) ? previousFocused : null;

    if (!container.hasAttribute("tabindex")) container.tabIndex = -1; // alvo de foco de reserva
    if (!container.contains(document.activeElement)) {
      const initial = container.querySelector<HTMLElement>("[data-autofocus]") ?? focusableIn(container)[0] ?? container;
      initial.focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (openStack[openStack.length - 1] !== id) return; // so o dialogo do topo
      if (event.key === "Escape") {
        if (onCloseRef.current) {
          event.stopPropagation();
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== "Tab" || !container) return;
      const items = focusableIn(container);
      if (items.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !active || !container.contains(active);
      if (event.shiftKey && (active === first || active === container || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const at = openStack.indexOf(id);
      if (at >= 0) openStack.splice(at, 1);
      // So devolve o foco se ninguem o levou para outro lugar de proposito (ex.: o app focar a busca ao cancelar):
      // "perdido" = no body ou ainda dentro do dialogo que esta sendo removido.
      const active = document.activeElement;
      const lost = !active || active === document.body || container.contains(active);
      if (lost && opener && document.contains(opener)) opener.focus();
    };
  }, [open]);

  return ref;
}
