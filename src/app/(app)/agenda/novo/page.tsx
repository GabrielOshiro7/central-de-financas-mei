import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { getClientPickerOption } from "@/lib/clients/picker";
import { listVisibleProducts } from "@/lib/products/queries";
import { listVisibleCategories } from "@/lib/finance/categories";
import { parseDayParam } from "@/lib/agenda/schema";
import { defaultServiceRevenueCategoryId } from "@/lib/agenda/calculations";
import { DayAppointmentForm } from "@/components/agenda/DayAppointmentForm";
import { clockFor, isDateKey, todayKey } from "@/lib/time/zoned";

// Criar (Agenda A3): todo agendamento novo e do fluxo por dia (DAY).
export default async function NovoAgendamentoPage(props: PageProps<"/agenda/novo">) {
  const searchParams = await props.searchParams;
  const { business } = await requireOnboardedUser();

  // Prefill de "agendar o proximo" (ver AppointmentList.tsx) - mesmo cliente
  // e servicos do atendimento recem-concluido. So o cliente do prefill vai
  // para a tela: a busca de clientes e feita no servidor pelo ClientPicker.
  const clientIdParam = typeof searchParams.clientId === "string" ? searchParams.clientId : undefined;
  const [initialClient, services, categories] = await Promise.all([
    clientIdParam ? getClientPickerOption(business.id, clientIdParam) : Promise.resolve(null),
    listVisibleProducts(business.id, undefined, "SERVICO"),
    listVisibleCategories(business.id, "REVENUE"),
  ]);
  const serviceIdParam = searchParams.serviceId;
  const initialServiceIds = Array.isArray(serviceIdParam) ? serviceIdParam : serviceIdParam ? [serviceIdParam] : undefined;

  // Dia vindo do atalho "+ Novo agendamento nesta data" (so dias que existem;
  // senao, hoje da empresa).
  const dateParam = parseDayParam(searchParams.date);
  const initialDate = dateParam && isDateKey(dateParam) ? dateParam : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Novo agendamento</h1>
        <Link href="/agenda" className="text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400">
          ← Voltar para agenda
        </Link>
      </div>

      <DayAppointmentForm
        mode="create"
        initialClient={initialClient}
        services={services.map((s) => ({ id: s.id, name: s.name, defaultPrice: s.defaultPrice?.toString() ?? "" }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        defaultCategoryId={defaultServiceRevenueCategoryId(categories)}
        currency={business.currency}
        todayKey={todayKey(clockFor(business))}
        initialServiceIds={initialServiceIds}
        initialDate={initialDate}
      />
    </div>
  );
}
