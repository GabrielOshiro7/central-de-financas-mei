"use client";

import { CREATE_BUTTON_CLASS, CreateButtonContent } from "@/components/CreateButton";
import { openAppointmentPopup } from "@/lib/agenda/popupUrl";
import { formatDateKey } from "@/lib/time/zoned";

// Botoes que abrem o popup "Novo agendamento" (mudam a URL para ?novo=1...; o AgendaNewAppointment, montado na pagina,
// abre o popup). Sao <button type="button">, nao links: nao navegam.

// Botao de criacao do cabecalho da Agenda.
export function NewAppointmentButton() {
  return (
    <button type="button" onClick={() => openAppointmentPopup()} className={CREATE_BUTTON_CLASS}>
      <CreateButtonContent label="Novo agendamento" />
    </button>
  );
}

// Caixa pontilhada do dia vazio do Calendario: a caixa INTEIRA e UM unico botao (nada interativo aninhado) que abre o
// popup com a data daquele dia. Os dois textos continuam visiveis dentro dela. SEM aria-label: o nome acessivel vem do
// proprio conteudo (os dois textos visiveis + a data num <span className="sr-only">, so para leitor de tela), entao ele
// sempre contem o que se ve (WCAG 2.5.3, regra label-content-name-mismatch do axe). <button> nativo: Enter e Espaco
// funcionam sem codigo extra.
export function EmptyDayButton({ dateKey }: { dateKey: string }) {
  return (
    <button
      type="button"
      onClick={() => openAppointmentPopup({ date: dateKey })}
      data-testid="empty-day-button"
      className="flex w-full cursor-pointer flex-col items-center justify-center gap-3 border border-dashed border-gray-300 bg-white px-6 py-16 text-center text-sm text-gray-500 transition hover:border-gray-400 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:bg-neutral-800 dark:focus-visible:outline-neutral-100"
    >
      <span>Nenhum agendamento neste dia.</span>
      <span className="font-medium text-gray-900 dark:text-neutral-100">
        + Novo agendamento nesta data
        <span className="sr-only"> em {formatDateKey(dateKey)}</span>
      </span>
    </button>
  );
}
