import { BillListPage } from "../_shared/BillListPage";

export default async function ContasAPagarPage(props: PageProps<"/financeiro/pagar">) {
  const searchParams = await props.searchParams;
  return <BillListPage direction="PAYABLE" title="Contas a pagar" searchParams={searchParams} />;
}
