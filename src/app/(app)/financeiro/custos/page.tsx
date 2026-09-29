import { TransactionListPage } from "../_shared/TransactionListPage";

export default async function CustosPage(props: PageProps<"/financeiro/custos">) {
  const searchParams = await props.searchParams;
  return (
    <TransactionListPage
      type="COST"
      title="Custos"
      helpText="Gastos ligados diretamente ao que você vende — por exemplo, material usado ou comissão. Sobem e descem conforme você vende mais ou menos."
      searchParams={searchParams}
    />
  );
}
