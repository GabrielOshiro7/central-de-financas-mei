import { TransactionListPage } from "../_shared/TransactionListPage";

// Titulo da aba/janela (WCAG 2.4.2): descreve a pagina; o sufixo vem do template do layout raiz.
export const metadata = { title: "Despesas" };

export default async function DespesasPage(props: PageProps<"/financeiro/despesas">) {
  const searchParams = await props.searchParams;
  return (
    <TransactionListPage
      type="EXPENSE"
      title="Despesas"
      helpText="Gastos fixos do negócio, que existem mesmo se você vender mais ou menos — como aluguel, internet ou salário fixo."
      searchParams={searchParams}
    />
  );
}
