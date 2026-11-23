import { redirect } from "next/navigation";
import { novoRedirectSearch } from "@/lib/agenda/popupUrl";

// O "Novo agendamento" agora e um popup da propria Agenda. Esta rota continua existindo so para links antigos, favoritos e
// o "Agendar o proximo" de versoes anteriores: redireciona para /agenda?novo=1, repassando date, clientId e serviceId
// (repetido) - o popup valida e pre-preenche. A EDICAO (/agenda/[id]/editar) continua pagina.
export default async function NovoAgendamentoPage(props: PageProps<"/agenda/novo">) {
  const searchParams = await props.searchParams;
  redirect(`/agenda?${novoRedirectSearch(searchParams)}`);
}
