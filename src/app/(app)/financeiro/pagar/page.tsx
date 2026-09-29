import { BillListPage } from "../_shared/BillListPage";

export default async function ContasAPagarPage(props: PageProps<"/financeiro/pagar">) {
  const searchParams = await props.searchParams;
  return (
    <BillListPage
      direction="PAYABLE"
      title="Contas a pagar"
      helpText="Dinheiro que você ainda deve pagar a alguém, com uma data prevista."
      searchParams={searchParams}
    />
  );
}
