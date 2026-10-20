import { requireOnboardedUser } from "@/lib/auth/guards";
import { listClients, hasAnyClientsEver, getClientsSalesSummaryMap } from "@/lib/clients/queries";
import { ClientFilters } from "@/components/clientes/ClientFilters";
import { ClientTable, type ClientRow } from "@/components/clientes/ClientTable";
import { NewClientButton } from "@/components/clientes/NewClientButton";

type SearchParams = { [key: string]: string | string[] | undefined };

function paramString(searchParams: SearchParams, key: string): string | undefined {
  const value = searchParams[key];
  return typeof value === "string" ? value : undefined;
}

const VALID_STATUS = new Set(["ACTIVE", "INACTIVE", "ALL"]);

export default async function ClientesPage(props: PageProps<"/clientes">) {
  const searchParams = await props.searchParams;
  const { business } = await requireOnboardedUser();

  const statusParam = paramString(searchParams, "status");
  const status = (statusParam && VALID_STATUS.has(statusParam) ? statusParam : "ACTIVE") as
    | "ACTIVE"
    | "INACTIVE"
    | "ALL";
  const search = paramString(searchParams, "q");

  const [{ items }, hasAnyEver] = await Promise.all([
    listClients(business.id, { status, search, pageSize: 100 }),
    hasAnyClientsEver(business.id),
  ]);

  const salesSummaryMap = await getClientsSalesSummaryMap(
    business.id,
    items.map((c) => c.id)
  );

  const rows: ClientRow[] = items.map((c) => {
    const summary = salesSummaryMap.get(c.id);
    return {
      id: c.id,
      name: c.name,
      tradeName: c.tradeName ?? "",
      clientType: c.clientType,
      document: c.document ?? "",
      phone: c.phone ?? "",
      whatsapp: c.whatsapp ?? "",
      email: c.email ?? "",
      addressLine: c.addressLine ?? "",
      city: c.city ?? "",
      state: c.state ?? "",
      country: c.country ?? "",
      notes: c.notes ?? "",
      active: c.active,
      salesCount: summary?.salesCount ?? 0,
      lastPurchaseDisplay: summary?.lastPurchaseAt ? summary.lastPurchaseAt.toLocaleDateString("pt-BR") : null,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Clientes</h1>
        {hasAnyEver && <NewClientButton />}
      </div>

      {!hasAnyEver ? (
        <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-gray-300 bg-white px-6 py-16 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
          <p>Nenhum cliente cadastrado.</p>
          <NewClientButton />
        </div>
      ) : (
        <>
          <ClientFilters />
          <ClientTable rows={rows} />
        </>
      )}
    </div>
  );
}
