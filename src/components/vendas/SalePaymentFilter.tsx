"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { FilterPills } from "@/components/FilterPills";
import { SALE_PAYMENT_GROUPS, SALE_PAYMENT_GROUP_LABELS, parseSalePaymentGroup } from "@/lib/sales/paymentGroups";
import type { SalePaymentGroupCounts } from "@/lib/sales/queries";

// Filtro por situacao de PAGAMENTO acima da tabela de Vendas, com a contagem de
// cada grupo (ja calculada no servidor respeitando Pesquisar, Periodo e Status).
// O grupo vai na URL (?pagamento=atrasadas) - mantem ao recarregar e ao voltar.
export function SalePaymentFilter({ counts }: { counts: SalePaymentGroupCounts }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const active = parseSalePaymentGroup(searchParams.get("pagamento") ?? undefined) ?? "";

  function select(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("pagamento", value);
    else params.delete("pagamento");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <FilterPills
      label="Situação do pagamento"
      options={[
        { value: "", label: "Todas", count: counts.todas },
        ...SALE_PAYMENT_GROUPS.map((group) => ({ value: group, label: SALE_PAYMENT_GROUP_LABELS[group], count: counts[group] })),
      ]}
      value={active}
      onChange={select}
    />
  );
}
