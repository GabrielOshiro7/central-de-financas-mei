import { parseDayParam } from "@/lib/agenda/schema";
import { isDateKey } from "@/lib/time/zoned";

// O popup "Novo agendamento" abre pela URL da Agenda: /agenda?novo=1&date=AAAA-MM-DD&clientId=...&serviceId=...&serviceId=...
// (o servico pode repetir). Os botoes abrem o popup mexendo na URL (history.pushState, sem pedir a pagina de novo ao
// servidor) e /agenda/novo redireciona para ca - assim links antigos, favoritos e "Agendar o proximo" continuam
// funcionando. Ao fechar/salvar, so estes 4 parametros saem da URL (view, month e day ficam).
export const POPUP_PARAM = "novo";
const PREFILL_PARAMS = ["date", "clientId", "serviceId"] as const;

export type PopupPrefill = { date?: string; clientId?: string; serviceIds: string[] };

// Ponte entre o popup e o anfitriao (botao Voltar do navegador): o popup diz se ha dado preenchido e sabe pedir para fechar
// (com a confirmacao "Descartar agendamento?").
export type PopupGuard = { hasData: () => boolean; requestClose: () => void };

export function isPopupOpen(params: URLSearchParams): boolean {
  return params.get(POPUP_PARAM) === "1";
}

// Pre-preenchimento vindo da URL, com a MESMA validacao de antes (parseDayParam + isDateKey). Cliente e servicos sao
// so ids aqui: o popup confere que sao da empresa (cliente via getClientPickerOption, servicos contra a lista dela).
export function parsePopupPrefill(params: URLSearchParams): PopupPrefill {
  const rawDate = params.get("date");
  const date = parseDayParam(rawDate);
  const clientId = params.get("clientId")?.trim() || undefined;
  const serviceIds = params.getAll("serviceId").map((id) => id.trim()).filter(Boolean);
  return { date: date && isDateKey(date) ? date : undefined, clientId, serviceIds };
}

// Query string (sem "?") com o popup aberto, preservando os outros parametros da URL atual.
export function searchWithPopup(current: URLSearchParams, prefill: { date?: string; clientId?: string; serviceIds?: string[] } = {}): string {
  const next = new URLSearchParams(current.toString());
  for (const key of PREFILL_PARAMS) next.delete(key);
  next.set(POPUP_PARAM, "1");
  if (prefill.date) next.set("date", prefill.date);
  if (prefill.clientId) next.set("clientId", prefill.clientId);
  for (const id of prefill.serviceIds ?? []) next.append("serviceId", id);
  return next.toString();
}

// Query string (sem "?") sem os parametros do popup.
export function searchWithoutPopup(current: URLSearchParams): string {
  const next = new URLSearchParams(current.toString());
  next.delete(POPUP_PARAM);
  for (const key of PREFILL_PARAMS) next.delete(key);
  return next.toString();
}

// /agenda/novo?date=...&clientId=...&serviceId=... -> query de /agenda?novo=1&... (repassa o que veio, sem validar:
// quem valida e o popup).
export function novoRedirectSearch(searchParams: Record<string, string | string[] | undefined>): string {
  const out = new URLSearchParams();
  out.set(POPUP_PARAM, "1");
  for (const key of PREFILL_PARAMS) {
    const value = searchParams[key];
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      if (item) out.append(key, item);
    }
  }
  return out.toString();
}

// Abre o popup a partir de um botao: atualiza a URL pelo history nativo (o Next sincroniza useSearchParams).
export function openAppointmentPopup(prefill: { date?: string; clientId?: string; serviceIds?: string[] } = {}): void {
  if (typeof window === "undefined") return;
  const search = searchWithPopup(new URLSearchParams(window.location.search), prefill);
  window.history.pushState(null, "", `${window.location.pathname}?${search}`);
}

// Fecha: tira os parametros do popup da URL SEM criar nova entrada no historico.
export function closeAppointmentPopupUrl(): void {
  if (typeof window === "undefined") return;
  const search = searchWithoutPopup(new URLSearchParams(window.location.search));
  window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
}
