import { describe, it, expect } from "vitest";
import { computeTooltipAnchor } from "@/components/dashboard/ChartTooltip";

// Roda em ambiente "node" (sem jsdom) de proposito: computeTooltipAnchor usa
// `typeof window !== "undefined" ? window.innerWidth : 1024` como fallback,
// entao aqui ele sempre usa 1024 - determinístico, sem precisar de DOM real
// pra testar a logica pura de qual lado o tooltip abre.
function rect(overrides: Partial<DOMRect>): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON() {
      return this;
    },
    ...overrides,
  } as DOMRect;
}

describe("computeTooltipAnchor - nunca corta o tooltip na borda da tela (viewport 1024px no fallback)", () => {
  it("elemento perto da borda ESQUERDA (ex.: primeiro ponto/barra do gráfico) abre para a direita", () => {
    const anchor = computeTooltipAnchor(rect({ left: 0, right: 20, top: 100 }), 240);
    expect(anchor.placement).toBe("right");
    if (anchor.placement === "right") {
      expect(anchor.left).toBe(0);
    }
  });

  it("elemento perto da borda DIREITA (ex.: último ponto/barra do gráfico) abre para a esquerda", () => {
    const anchor = computeTooltipAnchor(rect({ left: 950, right: 990, top: 100 }), 240);
    expect(anchor.placement).toBe("left");
    if (anchor.placement === "left") {
      expect(anchor.right).toBe(1024 - 990);
    }
  });

  it("elemento no meio da tela, com espaço suficiente, abre para a direita", () => {
    const anchor = computeTooltipAnchor(rect({ left: 500, right: 540, top: 100 }), 240);
    expect(anchor.placement).toBe("right");
  });

  it("no limite exato do espaço disponível, ainda cabe à direita (só vira 'left' quando falta espaço)", () => {
    // viewportWidth(1024) - left(784) = 240 = estimatedWidth -> não é "< estimatedWidth", continua "right".
    const anchor = computeTooltipAnchor(rect({ left: 784, right: 800, top: 100 }), 240);
    expect(anchor.placement).toBe("right");
  });

  it("um pixel a menos de espaço já vira 'left'", () => {
    const anchor = computeTooltipAnchor(rect({ left: 785, right: 800, top: 100 }), 240);
    expect(anchor.placement).toBe("left");
  });
});
