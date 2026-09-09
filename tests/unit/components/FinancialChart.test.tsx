// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, within, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { FinancialChart } from "@/components/dashboard/FinancialChart";
import type { EvolutionPoint } from "@/components/dashboard/evolutionPoints";
import { formatMoney } from "@/lib/money";

afterEach(() => cleanup());

function point(overrides: Partial<EvolutionPoint> & { key: string; label: string }): EvolutionPoint {
  return {
    revenue: 0,
    costs: 0,
    expenses: 0,
    netProfit: 0,
    hasAnyEntries: true,
    ...overrides,
  };
}

// EvolutionPoint carrega `number` (nao Prisma.Decimal) de proposito: e o que
// atravessa a fronteira servidor->cliente pro FinancialChart (Client
// Component), e um Decimal (instancia de classe) nao pode atravessar essa
// fronteira - ver comentario em evolutionPoints.ts sobre o bug real que isso
// causou (so aparecia em runtime no navegador, nao neste teste nem no tsc).
const series: EvolutionPoint[] = [
  point({ key: "day1", label: "05/09", revenue: 1000, costs: 300, expenses: 150, netProfit: 550 }),
  point({ key: "day2", label: "06/09", revenue: 2000, costs: 700, expenses: 250, netProfit: 1050 }),
];

describe("FinancialChart - tooltip", () => {
  it("não mostra tooltip antes de qualquer hover", () => {
    render(<FinancialChart series={series} currency="BRL" />);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("mostra os valores corretos do dia sob o mouse, sem trocar Custos por Despesas", () => {
    render(<FinancialChart series={series} currency="BRL" />);

    const triggers = screen.getAllByRole("button");
    fireEvent.mouseEnter(triggers[1]); // dia 2 (06/09)

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("06/09");

    // Cada linha (label + valor) verificada isoladamente - pega um bug de
    // Custos/Despesas trocadas mesmo que os dois valores apareçam em algum
    // lugar do tooltip (o que um simples toHaveTextContent global não pegaria).
    expect(within(tooltip).getByText("Faturamento").closest("div")).toHaveTextContent(
      formatMoney(2000, "BRL")
    );
    expect(within(tooltip).getByText("Custos").closest("div")).toHaveTextContent(formatMoney(700, "BRL"));
    expect(within(tooltip).getByText("Despesas").closest("div")).toHaveTextContent(formatMoney(250, "BRL"));
    expect(within(tooltip).getByText("Lucro").closest("div")).toHaveTextContent(formatMoney(1050, "BRL"));

    // Valores do OUTRO dia não devem aparecer no tooltip.
    expect(tooltip).not.toHaveTextContent(formatMoney(1000, "BRL"));
    expect(tooltip).not.toHaveTextContent(formatMoney(300, "BRL"));
  });

  it("hover em pontos diferentes mostra valores diferentes (sem índice preso)", () => {
    render(<FinancialChart series={series} currency="BRL" />);
    const triggers = screen.getAllByRole("button");

    fireEvent.mouseEnter(triggers[0]);
    expect(screen.getByRole("tooltip")).toHaveTextContent("05/09");
    fireEvent.mouseLeave(triggers[0]);

    fireEvent.mouseEnter(triggers[1]);
    expect(screen.getByRole("tooltip")).toHaveTextContent("06/09");
  });

  it("esconde o tooltip ao tirar o mouse", () => {
    render(<FinancialChart series={series} currency="BRL" />);
    const triggers = screen.getAllByRole("button");
    fireEvent.mouseEnter(triggers[0]);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.mouseLeave(triggers[0]);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("clique alterna mostrar/esconder (toque em mobile)", () => {
    render(<FinancialChart series={series} currency="BRL" />);
    const triggers = screen.getAllByRole("button");
    fireEvent.click(triggers[0]);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.click(triggers[0]);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("o valor também fica disponível via aria-label, não só no tooltip visual (acessibilidade)", () => {
    render(<FinancialChart series={series} currency="BRL" />);
    const triggers = screen.getAllByRole("button");
    const label = triggers[1].getAttribute("aria-label");
    expect(label).toContain("06/09");
    expect(label).toContain(formatMoney(700, "BRL"));
    expect(label).toContain(formatMoney(250, "BRL"));
  });
});
