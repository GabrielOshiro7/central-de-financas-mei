"use client";

import { useState } from "react";
import Link from "next/link";
import { COOKIE_NOTICE_COOKIE, COOKIE_NOTICE_MAX_AGE_SECONDS, LEGAL_PATHS } from "@/content/legal/meta";

// Aviso de cookies: faixa discreta na parte de baixo, na primeira visita (publico e app).
// `sticky bottom-0` no fim do <body> (e nao `fixed`): fica grudada na base da tela, mas no fim
// da pagina ocupa o proprio espaco - nunca cobre de forma permanente o ultimo conteudo
// (importante no celular).
// NAO e consentimento (so usamos cookies essenciais e de preferencia): nao ha aceitar/
// recusar. "Entendi" grava um cookie essencial (cookie-notice=1) e o aviso nao volta; o
// SERVIDOR le esse cookie e nem renderiza o aviso depois disso (sem "piscar"). No app, o
// CSS (globals.css, .cookie-notice) o afasta da barra lateral para nao cobrir os botoes dela.
// So em desenvolvimento ha o indicador do Next no canto inferior direito (next.config.ts);
// la o aviso ganha folga a direita para o botao "Entendi" nao ficar sob o indicador.
const DEV_INDICATOR_GAP = process.env.NODE_ENV !== "production" ? "pr-16" : "";

export function CookieNotice() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  function dismiss() {
    document.cookie = `${COOKIE_NOTICE_COOKIE}=1; Path=/; Max-Age=${COOKIE_NOTICE_MAX_AGE_SECONDS}; SameSite=Lax`;
    setVisible(false);
  }

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className={`cookie-notice sticky bottom-0 z-30 border-t border-gray-300 bg-white px-4 py-2.5 shadow-[0_-1px_6px_rgba(0,0,0,0.06)] dark:border-neutral-700 dark:bg-neutral-900 ${DEV_INDICATOR_GAP}`}
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 text-xs leading-snug text-gray-700 dark:text-neutral-300">
          Usamos cookies essenciais e de preferência (login e tema). Não usamos cookies de análise nem de publicidade.{" "}
          <Link href={LEGAL_PATHS.cookies} className="font-medium text-gray-900 underline dark:text-neutral-100">
            Saiba mais
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-900 transition hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800 dark:focus-visible:outline-neutral-100"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
