// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MetricCard, type MetricVariation } from "@/components/dashboard/MetricCard";

afterEach(() => cleanup());

const GOOD = "text-emerald-600";
const BAD = "text-rose-600";
const NEUTRAL = "text-gray-500";

function variationLine(variation: MetricVariation) {
  render(<MetricCard label="Métrica" value="R$ 1,00" variation={variation} />);
  // A linha da variação é o pai do texto da variação.
  return screen.getByText(variation.text).parentElement!;
}

describe("MetricCard - cor da variação", () => {
  it("sem favorableDirection, subir é bom e cair é ruim (comportamento antigo)", () => {
    expect(variationLine({ text: "+10.0%", direction: "up" })).toHaveClass(GOOD);
    cleanup();
    expect(variationLine({ text: "-10.0%", direction: "down" })).toHaveClass(BAD);
  });

  it('favorableDirection "down" inverte a cor: subir é ruim, cair é bom (ex.: Custos, Despesas)', () => {
    expect(variationLine({ text: "+10.0%", direction: "up", favorableDirection: "down" })).toHaveClass(BAD);
    cleanup();
    expect(variationLine({ text: "-10.0%", direction: "down", favorableDirection: "down" })).toHaveClass(GOOD);
  });

  it("estável é sempre cinza, independente do sentido favorável", () => {
    expect(variationLine({ text: "0.0%", direction: "flat" })).toHaveClass(NEUTRAL);
    cleanup();
    expect(variationLine({ text: "0.0%", direction: "flat", favorableDirection: "down" })).toHaveClass(NEUTRAL);
  });

  it("a seta continua seguindo o número, não o sentido favorável", () => {
    variationLine({ text: "+10.0%", direction: "up", favorableDirection: "down" });
    expect(screen.getByText("↑")).toBeInTheDocument();
  });
});
