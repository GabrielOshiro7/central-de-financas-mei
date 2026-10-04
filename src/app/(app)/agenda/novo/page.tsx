import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { listVisibleClients } from "@/lib/clients/queries";
import { listVisibleProducts } from "@/lib/products/queries";
import { parseDayParam } from "@/lib/agenda/schema";
import { AppointmentForm } from "@/components/agenda/AppointmentForm";

// Horario padrao usado ao pre-preencher uma data vinda do atalho "Novo
// agendamento" do painel do dia no Calendario (redesign) - so um ponto de
// partida razoavel (horario comercial), o usuario troca livremente no
// formulario.
const DEFAULT_PREFILL_TIME = "09:00";

export default async function NovoAgendamentoPage(props: PageProps<"/agenda/novo">) {
  const searchParams = await props.searchParams;
  const { business } = await requireOnboardedUser();

  const [clients, services] = await Promise.all([
    listVisibleClients(business.id),
    listVisibleProducts(business.id, undefined, "SERVICO"),
  ]);

  // Prefill de "agendar o proximo" (ver AppointmentList.tsx) - mesmo cliente
  // e servicos do atendimento recem-concluido, so os ids; o usuario ainda
  // escolhe a data/hora do zero.
  const clientIdParam = typeof searchParams.clientId === "string" ? searchParams.clientId : undefined;
  const serviceIdParam = searchParams.serviceId;
  const initialServiceIds = Array.isArray(serviceIdParam) ? serviceIdParam : serviceIdParam ? [serviceIdParam] : undefined;

  // Prefill de data vindo do atalho "+ Novo agendamento nesta data" do
  // painel do dia no Calendario (redesign) - so a data; hora default
  // DEFAULT_PREFILL_TIME, o usuario escolhe o horario de verdade.
  const dateParam = parseDayParam(searchParams.date);
  const initialStartAt = dateParam ? `${dateParam}T${DEFAULT_PREFILL_TIME}` : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Novo agendamento</h1>
        <Link href="/agenda" className="text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400">
          ← Voltar para agenda
        </Link>
      </div>

      <AppointmentForm
        mode="create"
        clients={clients.map((c) => ({ id: c.id, name: c.name, tradeName: c.tradeName ?? "" }))}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.durationMinutes ?? 0,
          defaultPrice: s.defaultPrice?.toString() ?? "",
        }))}
        currency={business.currency}
        initialClientId={clientIdParam}
        initialServiceIds={initialServiceIds}
        initialStartAt={initialStartAt}
      />
    </div>
  );
}
