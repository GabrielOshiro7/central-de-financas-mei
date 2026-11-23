"use client";

import { CREATE_BUTTON_CLASS, CreateButtonContent } from "@/components/CreateButton";
import { openAppointmentPopup } from "@/lib/agenda/popupUrl";

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

// "+ Novo agendamento nesta data" (dia vazio do Calendario): abre o popup com a data pre-preenchida.
export function NewAppointmentOnDateButton({ dateKey }: { dateKey: string }) {
  return (
    <button
      type="button"
      onClick={() => openAppointmentPopup({ date: dateKey })}
      className="text-sm font-medium text-gray-900 hover:underline dark:text-neutral-100"
    >
      + Novo agendamento nesta data
    </button>
  );
}
