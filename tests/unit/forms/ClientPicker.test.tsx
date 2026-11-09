// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { ClientPicker, type ClientOption } from "@/components/agenda/ClientPicker";
import { useEnterToNextField } from "@/components/forms/useEnterToNextField";

// ClientPicker como combobox acessivel (role=combobox + listbox/option).
afterEach(cleanup);

const CLIENTS: ClientOption[] = [
  { id: "c1", name: "Ana Souza", tradeName: "" },
  { id: "c2", name: "Bruno Lima", tradeName: "Studio B" },
  { id: "c3", name: "Ana Paula", tradeName: "" },
];

function Page({ onSubmit }: { onSubmit: () => void }) {
  const enterNav = useEnterToNextField<HTMLFormElement>();
  const [clientId, setClientId] = useState("");
  return (
    <form {...enterNav} onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <ClientPicker clients={CLIENTS} clientId={clientId} onChange={setClientId} onError={() => {}} />
      <select aria-label="Adicionar serviço">
        <option value="">Adicionar serviço...</option>
      </select>
      <button type="submit">Agendar</button>
    </form>
  );
}

// O <select> nativo tambem tem papel combobox: a busca e achada pelo rotulo.
const search = () => screen.getByRole("combobox", { name: "Buscar cliente" });
const keyDown = (key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(search(), { key, ...init });
// As <option> do <select> nativo tambem tem papel option: so as da lista de clientes.
const options = () => within(screen.getByRole("listbox")).getAllByRole("option");
const type = (text: string) => fireEvent.change(search(), { target: { value: text } });

describe("ClientPicker - combobox", () => {
  it("expoe os papeis ARIA: combobox, listbox e option", () => {
    render(<Page onSubmit={() => {}} />);
    expect(search().getAttribute("aria-expanded")).toBe("true");
    expect(search().getAttribute("aria-autocomplete")).toBe("list");
    const listbox = screen.getByRole("listbox");
    expect(search().getAttribute("aria-controls")).toBe(listbox.id);
    expect(options()).toHaveLength(3);
  });

  it("ao digitar, o primeiro resultado fica destacado (aria-activedescendant / aria-selected)", () => {
    render(<Page onSubmit={() => {}} />);
    type("ana");
    const shown = options();
    expect(shown.map((o) => o.textContent)).toEqual(["Ana Souza", "Ana Paula"]);
    expect(shown[0].getAttribute("aria-selected")).toBe("true");
    expect(shown[1].getAttribute("aria-selected")).toBe("false");
    expect(search().getAttribute("aria-activedescendant")).toBe(shown[0].id);
  });

  it("campo vazio: nada destacado e Enter nao seleciona nem envia", () => {
    let submitted = 0;
    render(<Page onSubmit={() => submitted++} />);
    expect(search().getAttribute("aria-activedescendant")).toBeNull();
    expect(keyDown("Enter")).toBe(false); // tratado (preventDefault)
    expect(screen.queryByText("Trocar")).toBeNull();
    expect(submitted).toBe(0);
  });

  it("Setas mudam o destaque (com volta ao inicio/fim)", () => {
    render(<Page onSubmit={() => {}} />);
    type("ana");
    const [first, second] = options();
    keyDown("ArrowDown");
    expect(second.getAttribute("aria-selected")).toBe("true");
    keyDown("ArrowDown");
    expect(first.getAttribute("aria-selected")).toBe("true"); // volta ao inicio
    keyDown("ArrowUp");
    expect(second.getAttribute("aria-selected")).toBe("true"); // volta ao fim
    expect(search().getAttribute("aria-activedescendant")).toBe(second.id);
  });

  it("Enter seleciona o destacado e move o foco para o proximo campo, sem enviar o formulario", () => {
    let submitted = 0;
    render(<Page onSubmit={() => submitted++} />);
    search().focus();
    type("bru");
    expect(keyDown("Enter")).toBe(false);
    expect(screen.getByText("Bruno Lima")).toBeTruthy();
    expect(screen.getByText("Trocar")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Adicionar serviço"));
    expect(submitted).toBe(0);
  });

  it("Enter com a seta escolhe o segundo resultado", () => {
    render(<Page onSubmit={() => {}} />);
    search().focus();
    type("ana");
    keyDown("ArrowDown");
    keyDown("Enter");
    expect(screen.getByText("Ana Paula")).toBeTruthy();
    expect(screen.queryByText("Ana Souza")).toBeNull();
  });

  it("Esc fecha a lista; digitar ou seta abre de novo", () => {
    render(<Page onSubmit={() => {}} />);
    type("ana");
    keyDown("Escape");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(search().getAttribute("aria-expanded")).toBe("false");
    expect(search().getAttribute("aria-activedescendant")).toBeNull();
    keyDown("ArrowDown");
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(options()[0].getAttribute("aria-selected")).toBe("true");
  });

  it("sem resultados: lista some e Enter nao faz nada (nem envia)", () => {
    let submitted = 0;
    render(<Page onSubmit={() => submitted++} />);
    type("zzz");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(search().getAttribute("aria-expanded")).toBe("false");
    expect(keyDown("Enter")).toBe(false);
    expect(screen.queryByText("Trocar")).toBeNull();
    expect(submitted).toBe(0);
  });

  it("IME: Enter durante a composicao nao seleciona", () => {
    render(<Page onSubmit={() => {}} />);
    type("ana");
    expect(keyDown("Enter", { isComposing: true })).toBe(true);
    expect(screen.queryByText("Trocar")).toBeNull();
  });

  it("clique do mouse escolhe o cliente", () => {
    render(<Page onSubmit={() => {}} />);
    fireEvent.click(screen.getByText("Bruno Lima (Studio B)"));
    expect(screen.getByText("Trocar")).toBeTruthy();
  });

  it("mini-formulario Criar novo cliente: Enter no ultimo campo cria o cliente e NAO envia o formulario da pagina", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "novo" }) });
    vi.stubGlobal("fetch", fetchMock);
    let submitted = 0;
    render(<Page onSubmit={() => submitted++} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Criar novo cliente" }));
    const name = screen.getByLabelText("Nome do novo cliente");
    fireEvent.change(name, { target: { value: "Carla Nova" } });
    name.focus();
    expect(fireEvent.keyDown(name, { key: "Enter" })).toBe(false);
    await vi.waitFor(() => expect(screen.getByText("Carla Nova")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: "Carla Nova" });
    expect(submitted).toBe(0);
    // Cliente criado: o foco segue para o proximo campo do formulario.
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Adicionar serviço")));
    vi.unstubAllGlobals();
  });
});
