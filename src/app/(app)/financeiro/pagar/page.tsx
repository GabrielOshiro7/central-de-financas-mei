import { BillListPage } from "../_shared/BillListPage";

// Titulo da aba/janela (WCAG 2.4.2): descreve a pagina; o sufixo vem do template do layout raiz.
export const metadata = { title: "Contas a pagar" };

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
