import { TransactionListPage } from "../_shared/TransactionListPage";

export default async function ReceitasPage(props: PageProps<"/financeiro/receitas">) {
  const searchParams = await props.searchParams;
  return <TransactionListPage type="REVENUE" title="Receitas" searchParams={searchParams} />;
}
