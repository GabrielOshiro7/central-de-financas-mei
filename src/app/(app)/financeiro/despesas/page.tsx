import { TransactionListPage } from "../_shared/TransactionListPage";

export default async function DespesasPage(props: PageProps<"/financeiro/despesas">) {
  const searchParams = await props.searchParams;
  return <TransactionListPage type="EXPENSE" title="Despesas" searchParams={searchParams} />;
}
