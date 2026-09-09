// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Prisma } from "@prisma/client";
import { TrendMiniChart } from "@/components/dashboard/TrendMiniChart";
import { formatMoney } from "@/lib/money";
import { describeSignedGrowth } from "@/lib/finance/calculations";
import { formatSignedGrowthText } from "@/lib/finance/insights";

const { Decimal } = Prisma;

afterEach(() => cleanup());

const points = [
  { label: "02/09", value: 1000 },
  { label: "05/09", value: 3000 },
  { label: "09/09", value: 45000 },
];
const comparePoints = [
  { label: "26/08", value: 800 },
  { label: "29/08", value: 2500 },
  { label: "02/09", value: 12000 },
];

describe("TrendMiniChart - tooltip", () => {
  it("mostra o valor correto do ponto sob o mouse, formatado com formatMoney", () => {
    render(
      <TrendMiniChart title="Faturamento" points={points} currency="BRL" comparePoints={null} />
    );

    const triggers = screen.getAllByRole("button");
    fireEvent.mouseEnter(triggers[2]); // último ponto (09/09, 45000)

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("09/09");
    expect(tooltip).toHaveTextContent(formatMoney(new Decimal(45000), "BRL"));
    // Valor de outro ponto não deve aparecer.
    expect(tooltip).not.toHaveTextContent(formatMoney(new Decimal(1000), "BRL"));
  });

  it("com comparação ativa, mostra os dois valores rotulados e a variação (nunca dois números sem indicar qual é qual)", () => {
    render(
      <TrendMiniChart
        title="Faturamento"
        points={points}
        comparePoints={comparePoints}
        compareLabel="vs período anterior"
        currency="BRL"
      />
    );

    const triggers = screen.getAllByRole("button");
    fireEvent.mouseEnter(triggers[2]); // 09/09: 45000, comparação 02/09: 12000

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("09/09");
    expect(tooltip).toHaveTextContent(formatMoney(new Decimal(45000), "BRL"));
    expect(tooltip).toHaveTextContent("vs período anterior");
    expect(tooltip).toHaveTextContent("02/09");
    expect(tooltip).toHaveTextContent(formatMoney(new Decimal(12000), "BRL"));

    // Variação reaproveita describeSignedGrowth/formatSignedGrowthText (não
    // reimplementada) - confere que o texto exibido bate com o que essas
    // funções já testadas calculam pro mesmo par de valores.
    const expectedGrowth = formatSignedGrowthText(
      describeSignedGrowth(new Decimal(45000), new Decimal(12000)),
      "BRL"
    );
    expect(tooltip).toHaveTextContent(expectedGrowth);
  });

  it("pontos diferentes mostram a comparação correta correspondente (sem índice trocado entre as duas séries)", () => {
    render(
      <TrendMiniChart
        title="Faturamento"
        points={points}
        comparePoints={comparePoints}
        compareLabel="vs período anterior"
        currency="BRL"
      />
    );
    const triggers = screen.getAllByRole("button");

    fireEvent.mouseEnter(triggers[0]); // 02/09: 1000 vs 26/08: 800
    let tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent(formatMoney(new Decimal(1000), "BRL"));
    expect(tooltip).toHaveTextContent("26/08");
    expect(tooltip).toHaveTextContent(formatMoney(new Decimal(800), "BRL"));
    fireEvent.mouseLeave(triggers[0]);

    fireEvent.mouseEnter(triggers[1]); // 05/09: 3000 vs 29/08: 2500
    tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent(formatMoney(new Decimal(3000), "BRL"));
    expect(tooltip).toHaveTextContent("29/08");
    expect(tooltip).toHaveTextContent(formatMoney(new Decimal(2500), "BRL"));
  });

  it("trata corretamente a troca de sinal (prejuízo -> lucro) na variação exibida", () => {
    const profitPoints = [
      { label: "01/08", value: -500 },
      { label: "01/09", value: 300 },
    ];
    const profitCompare = [
      { label: "-", value: 0 },
      { label: "01/08", value: -500 },
    ];
    render(
      <TrendMiniChart
        title="Evolução do lucro"
        points={profitPoints}
        comparePoints={profitCompare}
        compareLabel="vs período anterior"
        currency="BRL"
      />
    );
    const triggers = screen.getAllByRole("button");
    fireEvent.mouseEnter(triggers[1]); // 300 vs -500 -> troca de sinal

    const tooltip = screen.getByRole("tooltip");
    const expectedGrowth = formatSignedGrowthText(describeSignedGrowth(new Decimal(300), new Decimal(-500)), "BRL");
    expect(tooltip).toHaveTextContent(expectedGrowth);
    expect(expectedGrowth).toMatch(/prejuízo/i);
  });

  it("o valor também fica disponível via aria-label (acessibilidade), incluindo comparação e variação", () => {
    render(
      <TrendMiniChart
        title="Faturamento"
        points={points}
        comparePoints={comparePoints}
        compareLabel="vs período anterior"
        currency="BRL"
      />
    );
    const triggers = screen.getAllByRole("button");
    const label = triggers[2].getAttribute("aria-label");
    expect(label).toContain("09/09");
    expect(label).toContain(formatMoney(new Decimal(45000), "BRL"));
    expect(label).toContain("vs período anterior");
    expect(label).toContain(formatMoney(new Decimal(12000), "BRL"));
  });
});
