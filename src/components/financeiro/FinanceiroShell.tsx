import type { ReactNode } from "react";
import { FinanceiroTabBar } from "@/components/financeiro/FinanceiroTabBar";

// Sem ação na barra de abas: a criação é contextual por aba (NewTransactionButton
// em Receitas/Custos/Despesas e Recorrentes; NewBillButton em Contas;
// importador em Importação). A prop `action` do FinanceiroTabBar continua
// existindo, só não é usada aqui.
export function FinanceiroShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <FinanceiroTabBar />
      {children}
    </div>
  );
}
