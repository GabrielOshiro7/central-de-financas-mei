// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { Currency } from "@prisma/client";
import { MoneyField, MoneyInput } from "@/components/MoneyInput";

afterEach(() => cleanup());

// Formulario minimo controlado, como os consumidores reais (useState<string>).
function Harness({
  initial = "",
  currency = "BRL",
  allowNegative = false,
  disabled = false,
  onEmit,
}: {
  initial?: string;
  currency?: Currency | null;
  allowNegative?: boolean;
  disabled?: boolean;
  onEmit?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div>
      <label htmlFor="amount">Valor</label>
      <MoneyInput
        id="amount"
        value={value}
        currency={currency}
        allowNegative={allowNegative}
        disabled={disabled}
        onChange={(v) => {
          setValue(v);
          onEmit?.(v);
        }}
      />
      <output data-testid="state">{value}</output>
    </div>
  );
}

function input(): HTMLInputElement {
  return screen.getByLabelText("Valor") as HTMLInputElement;
}
function state(): string {
  return screen.getByTestId("state").textContent ?? "";
}

// O navegador anexa o digito ao texto exibido; o componente recalcula.
function type(text: string) {
  for (const ch of text) fireEvent.change(input(), { target: { value: input().value + ch } });
}
function backspace() {
  fireEvent.change(input(), { target: { value: input().value.slice(0, -1) } });
}
function paste(text: string) {
  fireEvent.paste(input(), { clipboardData: { getData: () => text } });
}

describe("MoneyInput - digitacao", () => {
  it("1,2,3,4,5,0 -> 0,01 / 0,12 / 1,23 / 12,34 / 123,45 / 1.234,50", () => {
    render(<Harness />);
    const seen: string[] = [];
    for (const d of "123450") {
      type(d);
      seen.push(input().value);
    }
    expect(seen).toEqual(["0,01", "0,12", "1,23", "12,34", "123,45", "1.234,50"]);
    expect(state()).toBe("1234.50");
  });

  it("onChange emite so a string decimal limpa, nunca a formatada", () => {
    const emitted: string[] = [];
    render(<Harness onEmit={(v) => emitted.push(v)} />);
    type("123450");
    expect(emitted).toEqual(["0.01", "0.12", "1.23", "12.34", "123.45", "1234.50"]);
    for (const v of emitted) expect(v).not.toMatch(/[R$,]/);
  });

  it("backspace remove o ultimo digito e chega ao vazio", () => {
    render(<Harness initial="1234.50" />);
    backspace();
    expect(input().value).toBe("123,45");
    // 5 digitos restantes: 12,34 -> 1,23 -> 0,12 -> 0,01 -> vazio
    for (let i = 0; i < 4; i++) backspace();
    expect(input().value).toBe("0,01");
    backspace();
    expect(input().value).toBe("");
    expect(state()).toBe("");
    backspace();
    expect(input().value).toBe("");
  });

  it("campo vazio mostra placeholder 0,00, nunca NaN", () => {
    render(<Harness />);
    expect(input().value).toBe("");
    expect(input()).toHaveAttribute("placeholder", "0,00");
    expect(input().value).not.toMatch(/NaN/);
  });

  it("caracteres nao numericos sao ignorados", () => {
    render(<Harness initial="12.34" />);
    fireEvent.change(input(), { target: { value: "12,34abc" } });
    expect(input().value).toBe("12,34");
    expect(state()).toBe("12.34");
  });

  it("digitos alem do limite (14) sao ignorados", () => {
    render(<Harness initial="999999999999.99" />);
    type("1");
    expect(input().value).toBe("999.999.999.999,99");
    expect(state()).toBe("999999999999.99");
  });

  it("teclas muito rapidas: 30 digitos seguidos nao quebram nem passam do limite", () => {
    render(<Harness />);
    type("123456789012345678901234567890");
    expect(input().value).not.toMatch(/NaN/);
    expect(state().replace(/\D/g, "").length).toBeLessThanOrEqual(14);
  });

  it("teclado numerico no mobile: inputMode numeric, type text (sem spinner)", () => {
    render(<Harness />);
    expect(input()).toHaveAttribute("inputmode", "numeric");
    expect(input()).toHaveAttribute("type", "text");
    expect(input()).toHaveAttribute("autocomplete", "off");
  });
});

describe("MoneyInput - valor inicial vindo de fora", () => {
  it.each([
    ["45.9", "45,90"],
    ["1500", "1.500,00"],
    ["33.3", "33,30"],
    ["10.005", "10,01"],
    ["0.00", "0,00"],
    ["", ""],
  ])("value=%j exibe %j no primeiro render", (initial, shown) => {
    render(<Harness initial={initial} />);
    expect(input().value).toBe(shown);
  });

  it("segue o pai: reset para vazio limpa o campo", () => {
    function ResetHarness() {
      const [value, setValue] = useState("150.00");
      return (
        <div>
          <label htmlFor="amount">Valor</label>
          <MoneyInput id="amount" value={value} currency="BRL" onChange={setValue} />
          <button onClick={() => setValue("")}>reset</button>
        </div>
      );
    }
    render(<ResetHarness />);
    expect(input().value).toBe("150,00");
    fireEvent.click(screen.getByText("reset"));
    expect(input().value).toBe("");
  });
});

describe("MoneyInput - simbolo e moeda", () => {
  it("simbolo fica fora do texto editavel (nunca dentro do value)", () => {
    render(<Harness initial="1500" currency="BRL" />);
    expect(screen.getByText("R$")).toBeInTheDocument();
    expect(input().value).toBe("1.500,00");
    expect(input().value).not.toContain("R$");
    // aria-hidden: nao polui o nome acessivel do campo
    expect(screen.getByText("R$")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByLabelText("Valor")).toBe(input());
  });

  it("USD mostra US$ e usa padrao brasileiro", () => {
    render(<Harness initial="1234.5" currency="USD" />);
    expect(screen.getByText("US$")).toBeInTheDocument();
    expect(input().value).toBe("1.234,50");
  });

  it("JPY: simbolo e sem centavos", () => {
    render(<Harness currency="JPY" />);
    expect(screen.getByText("¥")).toBeInTheDocument();
    expect(input()).toHaveAttribute("placeholder", "0");
    type("1234");
    expect(input().value).toBe("1.234");
    expect(state()).toBe("1234");
  });

  it("currency null: sem simbolo, 2 casas", () => {
    const { container } = render(<Harness currency={null} initial="12.3" />);
    expect(container.querySelector("[aria-hidden='true']")).toBeNull();
    expect(input().value).toBe("12,30");
  });

  it("trocar para JPY com valor com centavos limpa o campo", () => {
    const { rerender } = render(<Harness initial="1500.50" currency="BRL" />);
    expect(input().value).toBe("1.500,50");
    rerender(<Harness initial="1500.50" currency="JPY" />);
    // Harness so guarda o estado inicial uma vez, entao o valor limpo vem do
    // onChange("") que o componente dispara ao detectar a troca.
    expect(input().value).toBe("");
    expect(state()).toBe("");
  });

  it("trocar para JPY com valor inteiro mantem o valor", () => {
    const { rerender } = render(<Harness initial="1500.00" currency="BRL" />);
    rerender(<Harness initial="1500.00" currency="JPY" />);
    expect(input().value).toBe("1.500");
    expect(state()).toBe("1500.00");
  });

  it("trocar de BRL para USD mantem o valor", () => {
    const { rerender } = render(<Harness initial="1500.50" currency="BRL" />);
    rerender(<Harness initial="1500.50" currency="USD" />);
    expect(input().value).toBe("1.500,50");
  });
});

describe("MoneyInput - paste", () => {
  it.each([
    ["1500", "1.500,00", "1500.00"],
    ["1500.00", "1.500,00", "1500.00"],
    ["1.500,00", "1.500,00", "1500.00"],
    ["R$ 1.234,56", "1.234,56", "1234.56"],
    ["1,500.00", "1.500,00", "1500.00"],
  ])("colar %j -> exibe %j, emite %j", (pasted, shown, emitted) => {
    render(<Harness />);
    paste(pasted);
    expect(input().value).toBe(shown);
    expect(state()).toBe(emitted);
  });

  it("colar SUBSTITUI o buffer (nao concatena com o que ja estava digitado)", () => {
    render(<Harness initial="99.99" />);
    paste("R$ 1.234,56");
    expect(input().value).toBe("1.234,56");
  });

  it("texto nao reconhecivel cai na extracao bruta de digitos", () => {
    render(<Harness />);
    paste("abc123def");
    expect(input().value).toBe("1,23");
    expect(state()).toBe("1.23");
  });

  it("colar sem nenhum digito nao altera o valor", () => {
    render(<Harness initial="12.34" />);
    paste("abc");
    expect(input().value).toBe("12,34");
  });

  it("colar acima do limite e ignorado", () => {
    render(<Harness initial="12.34" />);
    paste("9999999999999.99");
    expect(input().value).toBe("12,34");
  });

  it("colar negativo sem allowNegative vira positivo", () => {
    render(<Harness />);
    paste("-50,5");
    expect(state()).toBe("50.50");
  });

  it("colar em campo desabilitado nao altera", () => {
    render(<Harness initial="12.34" disabled />);
    paste("999");
    expect(input().value).toBe("12,34");
  });
});

describe("MoneyInput - disabled", () => {
  it("mostra o valor e ignora entrada", () => {
    const onEmit = vi.fn();
    render(<Harness initial="1500" disabled onEmit={onEmit} />);
    expect(input()).toBeDisabled();
    expect(input().value).toBe("1.500,00");
    fireEvent.change(input(), { target: { value: "1.500,001" } });
    expect(onEmit).not.toHaveBeenCalled();
  });
});

describe("MoneyInput - sinal (allowNegative)", () => {
  it("sem allowNegative nao existe o botao de sinal e '-' e ignorado", () => {
    render(<Harness initial="12.34" />);
    expect(screen.queryByRole("button", { name: /alternar sinal/i })).toBeNull();
    fireEvent.change(input(), { target: { value: "-12,34" } });
    expect(state()).toBe("12.34");
  });

  it("botao alterna o sinal do valor", () => {
    render(<Harness initial="500.50" allowNegative />);
    const toggle = screen.getByRole("button", { name: /alternar sinal/i });
    fireEvent.click(toggle);
    expect(state()).toBe("-500.50");
    expect(input().value).toBe("-500,50");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);
    expect(state()).toBe("500.50");
    expect(input().value).toBe("500,50");
  });

  it("botao com campo vazio: sinal fica pendente e vale no primeiro digito", () => {
    render(<Harness allowNegative />);
    fireEvent.click(screen.getByRole("button", { name: /alternar sinal/i }));
    expect(input().value).toBe("-");
    expect(state()).toBe("");
    type("5");
    expect(state()).toBe("-0.05");
    expect(input().value).toBe("-0,05");
  });

  it("tecla '-' com o campo vazio tambem deixa o sinal pendente", () => {
    render(<Harness allowNegative />);
    fireEvent.change(input(), { target: { value: "-" } });
    expect(input().value).toBe("-");
    type("1250");
    expect(state()).toBe("-12.50");
  });

  it("nunca emite -0: alternar em zero mantem 0.00", () => {
    render(<Harness initial="0.00" allowNegative />);
    fireEvent.click(screen.getByRole("button", { name: /alternar sinal/i }));
    expect(state()).toBe("0.00");
    expect(input().value).toBe("0,00");
  });

  it("colar negativo com allowNegative", () => {
    render(<Harness allowNegative />);
    paste("-R$ 1.234,56");
    expect(state()).toBe("-1234.56");
    expect(input().value).toBe("-1.234,56");
  });

  it("valor negativo de entrada e exibido com sinal", () => {
    render(<Harness initial="-2000" allowNegative />);
    expect(input().value).toBe("-2.000,00");
  });

  it("botao de sinal desabilitado junto com o campo", () => {
    render(<Harness initial="5" allowNegative disabled />);
    expect(screen.getByRole("button", { name: /alternar sinal/i })).toBeDisabled();
  });
});

describe("MoneyInput - cursor", () => {
  it("cursor colapsado no meio volta para o fim (nao insere digito no meio)", () => {
    render(<Harness initial="1234.50" />);
    input().focus();
    input().setSelectionRange(2, 2);
    fireEvent.select(input());
    expect(input().selectionStart).toBe(input().value.length);
    expect(input().selectionEnd).toBe(input().value.length);
  });

  it("selecao de intervalo e preservada (selecionar tudo para substituir)", () => {
    render(<Harness initial="1234.50" />);
    input().focus();
    input().setSelectionRange(0, input().value.length);
    fireEvent.select(input());
    expect(input().selectionStart).toBe(0);
    expect(input().selectionEnd).toBe(input().value.length);
  });

  it("selecionar tudo e digitar um digito recomeca o buffer", () => {
    render(<Harness initial="1234.50" />);
    fireEvent.change(input(), { target: { value: "7" } });
    expect(input().value).toBe("0,07");
    expect(state()).toBe("0.07");
  });
});

describe("MoneyField - label e erro", () => {
  it("label associada ao input, erro exibido e aria-invalid", () => {
    render(<MoneyField id="valor" label="Valor" value="" currency="BRL" onChange={() => {}} error="Digite um valor." />);
    const field = screen.getByLabelText("Valor");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Digite um valor.")).toBeInTheDocument();
  });

  it("sem erro: aria-invalid false e nada de mensagem", () => {
    render(<MoneyField id="valor" label="Valor" value="10" currency="BRL" onChange={() => {}} />);
    expect(screen.getByLabelText("Valor")).toHaveAttribute("aria-invalid", "false");
    expect((screen.getByLabelText("Valor") as HTMLInputElement).value).toBe("10,00");
  });
});
