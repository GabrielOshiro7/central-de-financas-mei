import { TransactionListPage } from "../_shared/TransactionListPage";

// Titulo da aba/janela (WCAG 2.4.2): descreve a pagina; o sufixo vem do template do layout raiz.
export const metadata = { title: "Custos" };

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
