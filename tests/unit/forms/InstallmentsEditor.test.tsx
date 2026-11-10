// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { InstallmentsEditor, type InstallmentRow } from "@/components/vendas/InstallmentsEditor";
import { useEnterToNextField } from "@/components/forms/useEnterToNextField";

// Editor de parcelas compartilhado: modo "monthly" (Agenda: mensal + divisao
// automatica) e modo "interval" (Vendas, padrao - inalterado).
afterEach(cleanup);

function Harness({ mode, initialTotal = 300, currency = "BRL", initialRows }: { mode?: "interval" | "monthly"; initialTotal?: number; currency?: "BRL" | "JPY"; initialRows?: InstallmentRow[] }) {
  const enterNav = useEnterToNextField<HTMLFormElement>();
  const [total, setTotal] = useState(initialTotal);
  const [rows, setRows] = useState<InstallmentRow[]>(initialRows ?? [{ dueDateInput: "2026-10-31", amount: "" }]);
  return (
    <form {...enterNav} onSubmit={(e) => e.preventDefault()}>
      <button type="button" onClick={() => setTotal(380)}>total380</button>
      <InstallmentsEditor installments={rows} onChange={setRows} currency={currency} total={total} baseDate="2026-10-31" todayKey="2026-10-31" showSplit mode={mode} />
    </form>
  );
}

const dues = () => screen.getAllByLabelText("Vencimento").map((el) => (el as HTMLInputElement).value);
const amounts = () => screen.getAllByLabelText("Valor").map((el) => (el as HTMLInputElement).value.replace(/\D/g, ""));
const count = () => screen.getByLabelText("Nº de parcelas") as HTMLInputElement;

describe("InstallmentsEditor - modo mensal (Agenda)", () => {
  it("sem 'Intervalo (dias)' e sem 'Dividir igualmente'; abre com 1 parcela de valor total", () => {
    render(<Harness mode="monthly" />);
    expect(screen.queryByLabelText("Intervalo (dias)")).toBeNull();
    expect(screen.queryByRole("button", { name: "Dividir igualmente" })).toBeNull();
    expect(dues()).toEqual(["2026-10-31"]);
    expect(amounts()).toEqual(["30000"]);
  });

  it("Enter no Nº de parcelas gera as mensais (31 -> 30 -> 31...), foca o vencimento da 1ª e não envia", () => {
    render(<Harness mode="monthly" />);
    fireEvent.change(count(), { target: { value: "4" } });
    count().focus();
    fireEvent.keyDown(count(), { key: "Enter" });
    expect(dues()).toEqual(["2026-10-31", "2026-11-30", "2026-12-31", "2027-01-31"]);
    expect(amounts()).toEqual(["7500", "7500", "7500", "7500"]);
    expect(document.activeElement).toBe(document.getElementById("due-0"));
  });

  it("Enter durante composição de IME não gera as parcelas", () => {
    render(<Harness mode="monthly" />);
    fireEvent.change(count(), { target: { value: "3" } });
    fireEvent.keyDown(count(), { key: "Enter", isComposing: true });
    expect(dues()).toHaveLength(1);
  });

  it("sair do campo (blur) confirma; valor inválido volta ao número atual", () => {
    render(<Harness mode="monthly" />);
    fireEvent.change(count(), { target: { value: "3" } });
    fireEvent.blur(count());
    expect(dues()).toHaveLength(3);
    fireEvent.change(count(), { target: { value: "0" } });
    fireEvent.blur(count());
    expect(count().value).toBe("3");
    expect(dues()).toHaveLength(3);
  });

  it("mudar o total recalcula valores e datas; mudar a 1ª data só refaz as demais; edição manual vale até mudar de novo", () => {
    render(<Harness mode="monthly" />);
    fireEvent.change(count(), { target: { value: "3" } });
    fireEvent.blur(count());
    expect(amounts()).toEqual(["10000", "10000", "10000"]);

    // 1ª data: as demais acompanham, valores ficam.
    fireEvent.change(screen.getAllByLabelText("Vencimento")[0], { target: { value: "2027-01-31" } });
    expect(dues()).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
    expect(amounts()).toEqual(["10000", "10000", "10000"]);

    // Edição manual de uma data fica.
    fireEvent.change(screen.getAllByLabelText("Vencimento")[1], { target: { value: "2027-03-05" } });
    expect(dues()).toEqual(["2027-01-31", "2027-03-05", "2027-03-31"]);

    // Total muda: tudo recalculado (380 / 3 = 126,66 / 126,66 / 126,68), 1ª data mantida.
    fireEvent.click(screen.getByRole("button", { name: "total380" }));
    expect(amounts()).toEqual(["12666", "12666", "12668"]);
    expect(dues()).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
  });

  it("adicionar e remover linha recalcula conforme a divisão automática", () => {
    render(<Harness mode="monthly" initialTotal={100} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Adicionar parcela" }));
    expect(amounts()).toEqual(["5000", "5000"]);
    fireEvent.click(screen.getByRole("button", { name: "+ Adicionar parcela" }));
    expect(amounts()).toEqual(["3333", "3333", "3334"]);
    expect(count().value).toBe("3");
    fireEvent.click(screen.getAllByRole("button", { name: "Remover" })[0]);
    expect(amounts()).toEqual(["5000", "5000"]);
    expect(count().value).toBe("2");
  });

  it("JPY: 12.000 / 7 em unidades inteiras, sobra na última", () => {
    render(<Harness mode="monthly" currency="JPY" initialTotal={12000} />);
    fireEvent.change(count(), { target: { value: "7" } });
    fireEvent.blur(count());
    expect(amounts()).toEqual(["1714", "1714", "1714", "1714", "1714", "1714", "1716"]);
  });

  it("abrir uma edição com parcelas gravadas que fecham o total não as altera", () => {
    render(
      <Harness
        mode="monthly"
        initialTotal={380}
        initialRows={[
          { dueDateInput: "2027-01-31", amount: "95" },
          { dueDateInput: "2027-02-10", amount: "100" },
          { dueDateInput: "2027-03-31", amount: "90" },
          { dueDateInput: "2027-04-30", amount: "95" },
        ]}
      />
    );
    expect(dues()).toEqual(["2027-01-31", "2027-02-10", "2027-03-31", "2027-04-30"]);
    expect(amounts()).toEqual(["9500", "10000", "9000", "9500"]);
    expect(count().value).toBe("4");
  });
});

describe("InstallmentsEditor - modo padrão (Vendas) inalterado", () => {
  it("mantém 'Intervalo (dias)' e 'Dividir igualmente'; nada é recalculado sozinho", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Intervalo (dias)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dividir igualmente" })).toBeTruthy();
    expect(amounts()).toEqual([""]); // sem divisão automática
    fireEvent.change(count(), { target: { value: "3" } });
    fireEvent.keyDown(count(), { key: "Enter" });
    fireEvent.blur(count());
    expect(dues()).toHaveLength(1); // só o botão divide
  });

  it("'Dividir igualmente' segue pelo intervalo em dias e arredondando como antes", () => {
    render(<Harness initialTotal={100} />);
    fireEvent.change(count(), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Dividir igualmente" }));
    expect(dues()).toEqual(["2026-10-31", "2026-11-30", "2026-12-30"]); // +30 dias, nao mensal
    expect(amounts()).toEqual(["3333", "3333", "3334"]);
  });
});
