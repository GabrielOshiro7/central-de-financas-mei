// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { MoneyField, MoneyInput } from "@/components/MoneyInput";

// Hidratacao: o componente NAO pode ler API de navegador durante o render.
// Este arquivo roda em ambiente "node" (sem window/document/navigator); se o
// render tocasse qualquer um deles, renderToString lancaria ReferenceError.
// O DOM so e usado dentro de handlers/effects (cursor no fim), que nao rodam
// no servidor.
describe("MoneyInput - render no servidor (sem DOM)", () => {
  it("o ambiente do teste realmente nao tem DOM", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
  });

  it("renderiza no servidor sem lancar e ja formata o valor inicial", () => {
    const html = renderToString(<MoneyInput id="a" value="1500" currency="BRL" onChange={() => {}} />);
    expect(html).toContain("1.500,00");
    expect(html).toContain("R$");
    expect(html).toContain('inputMode="numeric"');
  });

  it("todas as variantes renderizam no servidor: JPY, null, negativo, disabled, vazio", () => {
    const noop = () => {};
    expect(renderToString(<MoneyInput value="1500" currency="JPY" onChange={noop} />)).toContain("1.500");
    expect(renderToString(<MoneyInput value="12.3" currency={null} onChange={noop} />)).toContain("12,30");
    expect(renderToString(<MoneyInput value="-5" currency="BRL" allowNegative onChange={noop} />)).toContain("-5,00");
    expect(renderToString(<MoneyInput value="5" currency="BRL" disabled onChange={noop} />)).toContain("disabled");
    expect(renderToString(<MoneyInput value="" currency="BRL" onChange={noop} />)).toContain('placeholder="0,00"');
  });

  it("MoneyField tambem renderiza no servidor", () => {
    const html = renderToString(
      <MoneyField id="v" label="Valor" value="10" currency="USD" onChange={() => {}} error="Erro" />
    );
    expect(html).toContain("Valor");
    expect(html).toContain("10,00");
    expect(html).toContain("Erro");
  });

  it("e deterministico: duas renderizacoes com as mesmas props geram o mesmo HTML (o que o cliente hidrata)", () => {
    const render = () => renderToString(<MoneyInput id="a" value="1234.5" currency="BRL" onChange={() => {}} />);
    expect(render()).toBe(render());
  });
});
