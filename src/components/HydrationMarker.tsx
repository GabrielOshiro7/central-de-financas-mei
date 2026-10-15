"use client";

import { useEffect } from "react";

/**
 * Marca `data-hydrated="true"` na <html> assim que o React termina de
 * hidratar a página. Existe para os testes E2E (tests/e2e/helpers/hydration.ts):
 * antes disso os handlers do React ainda não estão ligados, e um clique num
 * formulário vira submit nativo do navegador (GET na própria URL) em vez do
 * fetch do componente.
 *
 * Fica por último no <body> de propósito: efeitos rodam dos filhos para os
 * pais e, entre irmãos, na ordem da árvore - quando este roda, a página
 * renderizada antes dele já foi hidratada no mesmo commit. O atributo é
 * escrito direto no DOM (fora do controle do React), então não gera
 * mismatch; numa navegação client-side a <html> persiste e o atributo
 * continua valendo, como deve.
 */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}
