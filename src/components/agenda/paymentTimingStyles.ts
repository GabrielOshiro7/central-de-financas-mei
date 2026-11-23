// Botoes "A vista" / "A prazo" do agendamento por dia: UMA classe so, usada no popup de novo agendamento e na pagina de
// edicao. Mesmo par ativo/inativo do seletor Receita/Despesa dos modais de lancamento: contraste AA nos dois temas (o
// inativo antigo, bg-gray-100 + text-gray-600, dava 3,87:1 no tema escuro).
export const timingButtonClass = (active: boolean) =>
  `flex-1 border px-3 py-2 text-sm font-medium transition ${
    active
      ? "border-gray-900 bg-gray-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
      : "border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
  }`;
