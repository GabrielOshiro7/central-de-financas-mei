import { BillListPage } from "../_shared/BillListPage";

// Titulo da aba/janela (WCAG 2.4.2): descreve a pagina; o sufixo vem do template do layout raiz.
export const metadata = { title: "Contas a receber" };

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
