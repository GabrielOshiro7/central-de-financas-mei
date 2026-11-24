import { MessageCircle, Phone } from "lucide-react";
import type { ClientContact } from "@/lib/clients/contactLinks";

// Contato do cliente no cartao do agendamento: o numero como foi digitado (texto secundario) e os atalhos "Ligar" e
// "WhatsApp" (botoes pequenos de contorno, sem laranja). Componente de servidor: so links, sem JavaScript no navegador.
// Icones genericos do lucide (nada da marca do WhatsApp). O WhatsApp abre em outra aba (wa.me); o sistema nao envia nada.
//
// Area de toque: 44x44 px no celular (min-h/min-w-11), o tamanho compacto so de sm para cima.
const SHORTCUT_CLASS =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 border border-gray-300 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-gray-700 transition hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:focus-visible:outline-neutral-100 sm:min-h-8 sm:min-w-0";

export function AppointmentContact({ clientName, contact }: { clientName: string | null; contact: ClientContact | null }) {
  if (!contact || !clientName) return null;
  return (
    <div data-testid="appointment-contact" className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-sm text-gray-500 dark:text-neutral-400">{contact.display}</span>
      <div className="flex flex-wrap items-center gap-2">
        {contact.telHref && (
          <a href={contact.telHref} aria-label={`Ligar para ${clientName}`} className={SHORTCUT_CLASS}>
            <Phone size={14} aria-hidden="true" />
            Ligar
          </a>
        )}
        {contact.whatsappHref && (
          <a href={contact.whatsappHref} target="_blank" rel="noopener noreferrer" aria-label={`Abrir WhatsApp de ${clientName}`} className={SHORTCUT_CLASS}>
            <MessageCircle size={14} aria-hidden="true" />
            WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
