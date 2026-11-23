"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { NewAppointmentModal } from "@/components/agenda/NewAppointmentModal";
import { closeAppointmentPopupUrl, isPopupOpen, parsePopupPrefill, searchWithoutPopup, type PopupGuard } from "@/lib/agenda/popupUrl";
import { formatDateKey } from "@/lib/time/zoned";

const subscribeNothing = () => () => {};

// Quanto tempo a confirmacao "Agendamento salvo para ..." fica na tela.
export const SAVED_NOTICE_MS = 8000;

// Anfitriao do popup "Novo agendamento" na pagina /agenda. O popup abre quando a URL ganha ?novo=1 (os botoes mudam a
// URL pelo history; /agenda/novo redireciona para ca). Portal no <body>, montado so enquanto visivel: o formulario nasce
// limpo a cada abertura. Depois de salvar: fecha, atualiza a Agenda (router.refresh) e mostra uma linha de status perto
// do cabecalho que some sozinha. Nao navega.
//
// O popup estar visivel NAO e "a URL tem ?novo=1" a todo instante: e um estado proprio (`shown`) que a URL liga (abrir) e
// que so desliga por fechamento explicito ou pelo Voltar do navegador sem dado. Motivo: no Voltar o Next troca a URL e
// re-renderiza antes de qualquer ouvinte nosso; se a visibilidade seguisse a URL, o popup desmontaria e os dados morreriam.
//
// BOTAO VOLTAR DO NAVEGADOR com o popup aberto (o popup abre com history.pushState, entao Voltar tira o ?novo=1 da URL):
//  - SEM dado preenchido: o popup fecha e o usuario continua na Agenda (a URL volta a /agenda...).
//  - COM dado preenchido: o popup NAO fecha: a URL do popup e restaurada (pushState) e abre o "Descartar agendamento?";
//    "Continuar editando" mantem tudo; "Descartar" fecha e deixa a URL limpa.
//  - Chegando por ?novo=1 direto (link antigo /agenda/novo): a entrada do historico e desdobrada em "Agenda limpa" +
//    "Agenda com o popup", para o Voltar cair na propria Agenda em vez de sair dela.
//  - AVANCAR do navegador depois de fechar: a URL volta a ter ?novo=1 e o popup REABRE VAZIO (so com o pre-preenchimento
//    da URL, se houver); os dados antigos nunca voltam, porque o estado do popup morre ao fechar.
export function AgendaNewAppointment() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // So no navegador (createPortal precisa do document): false no servidor, true depois da hidratacao.
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const guard = useRef<PopupGuard | null>(null);
  const popupSearch = useRef("");
  const unfolded = useRef(false);

  const urlOpen = isPopupOpen(searchParams);
  const [shown, setShown] = useState(urlOpen);
  // A URL abre o popup (botoes, link antigo, Avancar do navegador): sincroniza durante a renderizacao (padrao do React
  // para estado derivado, sem efeito), mas SO na TRANSICAO "sem ?novo=1" -> "com ?novo=1". Olhar o valor atual da URL a
  // cada render reabriria o popup logo depois de fechar: o replaceState que limpa a URL so chega ao useSearchParams
  // depois, e nesse intervalo a URL ainda "parece" aberta.
  const [lastUrlOpen, setLastUrlOpen] = useState(urlOpen);
  if (urlOpen !== lastUrlOpen) {
    setLastUrlOpen(urlOpen);
    if (urlOpen) setShown(true);
  }

  const prefill = useMemo(() => parsePopupPrefill(searchParams), [searchParams]);

  // Guarda a URL com o popup aberto (para restaurar no Voltar com dado preenchido).
  useEffect(() => {
    if (urlOpen) popupSearch.current = window.location.search;
  }, [urlOpen, searchParams]);

  // Chegada direta com ?novo=1: desdobra a entrada do historico (Agenda limpa + Agenda com o popup).
  useEffect(() => {
    if (unfolded.current) return;
    unfolded.current = true;
    const current = new URLSearchParams(window.location.search);
    if (!isPopupOpen(current)) return;
    const withPopup = `${window.location.pathname}${window.location.search}`;
    const clean = searchWithoutPopup(current);
    window.history.replaceState(null, "", `${window.location.pathname}${clean ? `?${clean}` : ""}`);
    window.history.pushState(null, "", withPopup);
  }, []);

  // Botao Voltar com o popup aberto: com dado preenchido, mantem o popup e pergunta antes de descartar; sem dado, fecha.
  useEffect(() => {
    if (!shown) return;
    function onPopState() {
      if (isPopupOpen(new URLSearchParams(window.location.search))) return;
      const current = guard.current;
      if (!current || !current.hasData()) {
        setShown(false);
        return;
      }
      window.history.pushState(null, "", `${window.location.pathname}${popupSearch.current}`);
      current.requestClose();
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [shown]);

  useEffect(() => {
    if (!savedMessage) return;
    const timer = setTimeout(() => setSavedMessage(null), SAVED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [savedMessage]);

  // Fechar (Cancelar, Esc, Descartar): desliga o popup e limpa a URL (sem nova entrada no historico).
  function closePopup() {
    setShown(false);
    closeAppointmentPopupUrl();
  }

  function handleSaved(scheduledOn: string) {
    closePopup();
    setSavedMessage(`Agendamento salvo para ${formatDateKey(scheduledOn)}`);
    router.refresh();
  }

  return (
    <>
      {savedMessage && (
        <p role="status" className="border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          {savedMessage}
        </p>
      )}
      {mounted && shown && createPortal(<NewAppointmentModal prefill={prefill} onClose={closePopup} onSaved={handleSaved} guardRef={guard} />, document.body)}
    </>
  );
}
