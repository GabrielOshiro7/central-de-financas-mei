// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { InfoTooltip } from "@/components/InfoTooltip";

afterEach(() => cleanup());

function getTrigger() {
  return screen.getByRole("button", { name: "O que é isso?" });
}

describe("InfoTooltip - desktop (mouse/teclado)", () => {
  it("abre no hover e fecha ao tirar o mouse", () => {
    render(<InfoTooltip text="Explicação de teste" />);
    const trigger = getTrigger();

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Explicação de teste");

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("abre e fecha com o foco de teclado (onFocus/onBlur)", () => {
    render(<InfoTooltip text="Explicação de teste" />);
    const trigger = getTrigger();

    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-describedby");

    fireEvent.blur(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("fecha com a tecla Esc mesmo aberto pelo hover", () => {
    render(<InfoTooltip text="Explicação de teste" />);
    const trigger = getTrigger();

    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

describe("InfoTooltip - dispositivo touch", () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, "maxTouchPoints", {
      value: 1,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window.navigator, "maxTouchPoints", {
      value: 0,
      configurable: true,
    });
  });

  it("hover não abre, mas o toque alterna aberto/fechado", async () => {
    render(<InfoTooltip text="Explicação de teste" />);
    const trigger = getTrigger();
    await Promise.resolve();

    fireEvent.mouseEnter(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.touchStart(trigger);
    fireEvent.click(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.touchStart(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("toque fora do balão fecha o tooltip", async () => {
    render(
      <div>
        <InfoTooltip text="Explicação de teste" />
        <button type="button">fora</button>
      </div>
    );
    const trigger = getTrigger();
    await Promise.resolve();

    fireEvent.click(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.touchStart(screen.getByRole("button", { name: "fora" }));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
