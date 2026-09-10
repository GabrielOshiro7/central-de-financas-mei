import { BillListPage } from "../_shared/BillListPage";

export default async function ContasAReceberPage(props: PageProps<"/financeiro/receber">) {
  const searchParams = await props.searchParams;
  return <BillListPage direction="RECEIVABLE" title="Contas a receber" searchParams={searchParams} />;
}
