import { TransactionListPage } from "../_shared/TransactionListPage";

export default async function CustosPage(props: PageProps<"/financeiro/custos">) {
  const searchParams = await props.searchParams;
  return <TransactionListPage type="COST" title="Custos" searchParams={searchParams} />;
}
