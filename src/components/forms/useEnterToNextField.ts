"use client";

import { useCallback, useEffect, useRef, type FocusEvent, type KeyboardEvent } from "react";
import { applyEnterKeyHint, applyEnterKeyHints, handleEnterKeyDown, ENTER_ROOT_ATTR } from "@/lib/forms/enterNavigation";

// Liga a navegacao por Enter (src/lib/forms/enterNavigation.ts) a um <form> ou
// a um contenedor sem <form> (modal, assistente):
//
//   const enterNav = useEnterToNextField<HTMLFormElement>();
//   <form {...enterNav} onSubmit={...}>
//
// Num contenedor sem <form>, marque o botao principal com data-enter-submit
// (o Enter no ultimo campo leva o foco ate ele). Mini-formularios embutidos:
// data-enter-group no contenedor e data-enter-confirm no botao que confirma.
export function useEnterToNextField<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);

  const onKeyDown = useCallback((event: KeyboardEvent<T>) => handleEnterKeyDown(event.nativeEvent, event.currentTarget), []);

  // Campos que aparecem depois da montagem (mini-formularios) recebem o
  // enterkeyhint quando ganham foco - antes de o teclado virtual abrir.
  const onFocus = useCallback((event: FocusEvent<T>) => applyEnterKeyHint(event.target, event.currentTarget), []);

  useEffect(() => {
    if (ref.current) applyEnterKeyHints(ref.current);
  }, []);

  return { ref, onKeyDown, onFocus, [ENTER_ROOT_ATTR]: "" } as const;
}
