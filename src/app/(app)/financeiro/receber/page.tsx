import { BillListPage } from "../_shared/BillListPage";

export default async function ContasAReceberPage(props: PageProps<"/financeiro/receber">) {
  const searchParams = await props.searchParams;
  return (
    <BillListPage
      direction="RECEIVABLE"
      title="Contas a receber"
      helpText="Dinheiro que um cliente ainda vai te pagar, com uma data prevista de recebimento."
      searchParams={searchParams}
    />
  );
}
