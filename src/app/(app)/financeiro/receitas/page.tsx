import { TransactionListPage } from "../_shared/TransactionListPage";

// Titulo da aba/janela (WCAG 2.4.2): descreve a pagina; o sufixo vem do template do layout raiz.
export const metadata = { title: "Receitas" };

export default async function ReceitasPage(props: PageProps<"/financeiro/receitas">) {
  const searchParams = await props.searchParams;
  return (
    <TransactionListPage
      type="REVENUE"
      title="Receitas"
      helpText="Todo o dinheiro que entrou pela venda dos seus produtos ou serviços."
      searchParams={searchParams}
    />
  );
}
