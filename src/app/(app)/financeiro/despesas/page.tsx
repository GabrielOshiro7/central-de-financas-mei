import { TransactionListPage } from "../_shared/TransactionListPage";

// Titulo da aba/janela (WCAG 2.4.2): descreve a pagina; o sufixo vem do template do layout raiz.
export const metadata = { title: "Despesas" };

export default async function DespesasPage(props: PageProps<"/financeiro/despesas">) {
  const searchParams = await props.searchParams;
  return (
    <TransactionListPage
      type="EXPENSE"
      title="Despesas"
      helpText="Tudo o que a empresa gasta — por exemplo aluguel, internet, salário, material ou comissão."
      searchParams={searchParams}
    />
  );
}
