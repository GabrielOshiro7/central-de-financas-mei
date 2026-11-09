// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { ClientPicker, CLIENT_SEARCH_DEBOUNCE_MS, type ClientOption } from "@/components/agenda/ClientPicker";
import { useEnterToNextField } from "@/components/forms/useEnterToNextField";

// O pop-up de cadastro usa o roteador do Next (router.refresh) - aqui e um no-op.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

// ClientPicker: lista so com foco (recentes ao focar vazio, busca no servidor ao
// digitar), combobox acessivel e pop-up de cadastro em portal.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const RECENT: ClientOption[] = [
  { id: "r1", name: "Recente Um", tradeName: "" },
  { id: "r2", name: "Recente Dois", tradeName: "Studio 2" },
  { id: "r3", name: "Recente Tres", tradeName: "" },
];
const ANA: ClientOption[] = [
  { id: "c1", name: "Ana Souza", tradeName: "" },
  { id: "c3", name: "Ana Paula", tradeName: "" },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return { ok: true, status: 201, json: async () => ({ id: "novo-id" }) };
    const q = new URL(url, "http://test").searchParams.get("q") ?? "";
    const clients = q === "" ? RECENT : q === "ana" ? ANA : q === "bru" ? [{ id: "b1", name: "Bruno Lima", tradeName: "Studio B" }] : [];
    return { ok: true, json: async () => ({ mode: q ? "search" : "recent", clients }) };
  });
  vi.stubGlobal("fetch", fetchMock);
});

function Page({ onSubmit, initialClient }: { onSubmit: () => void; initialClient?: ClientOption | null }) {
  const enterNav = useEnterToNextField<HTMLFormElement>();
  const [clientId, setClientId] = useState(initialClient?.id ?? "");
  return (
    <form {...enterNav} data-testid="page-form" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <ClientPicker clientId={clientId} initialClient={initialClient} onChange={setClientId} onError={() => {}} />
      <select aria-label="Adicionar serviço">
        <option value="">Adicionar serviço...</option>
      </select>
      <button type="submit">Agendar</button>
    </form>
  );
}

// O <select> nativo tambem tem papel combobox/option: a busca e a lista sao achadas pelo rotulo.
const search = () => screen.getByRole("combobox", { name: "Buscar cliente" });
const options = () => within(screen.getByRole("listbox")).getAllByRole("option");
const keyDown = (key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(search(), { key, ...init });
const type = (text: string) => fireEvent.change(search(), { target: { value: text } });
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
// Espera o debounce + a resposta da busca.
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, CLIENT_SEARCH_DEBOUNCE_MS + 60)); });
const focusSearch = async () => {
  await act(async () => search().focus());
  await flush();
};
const searchCalls = () => fetchMock.mock.calls.filter(([, init]) => init?.method !== "POST").map(([url]) => decodeURIComponent(String(url).split("q=")[1] ?? ""));

describe("ClientPicker - lista so com foco", () => {
  it("sem foco: nenhuma lista e nenhuma consulta", async () => {
    render(<Page onSubmit={() => {}} />);
    await flush();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByText("Recentes")).toBeNull();
    expect(search().getAttribute("aria-expanded")).toBe("false");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ao focar com o campo vazio: titulo 'Recentes' e os 3 recentes, nada destacado", async () => {
    render(<Page onSubmit={() => {}} />);
    await focusSearch();
    expect(searchCalls()).toEqual([""]);
    expect(screen.getByText("Recentes")).toBeTruthy();
    expect(options().map((o) => o.textContent)).toEqual(["Recente Um", "Recente Dois (Studio 2)", "Recente Tres"]);
    expect(search().getAttribute("aria-expanded")).toBe("true");
    expect(search().getAttribute("aria-activedescendant")).toBeNull();
    expect(options().every((o) => o.getAttribute("aria-selected") === "false")).toBe(true);
  });

  it("expoe os papeis ARIA: combobox, listbox e option", async () => {
    render(<Page onSubmit={() => {}} />);
    await focusSearch();
    expect(search().getAttribute("aria-autocomplete")).toBe("list");
    const listbox = screen.getByRole("listbox", { name: "Clientes recentes" });
    expect(search().getAttribute("aria-controls")).toBe(listbox.id);
  });

  it("perder o foco fecha a lista; Esc tambem; focar de novo reabre", async () => {
    render(<Page onSubmit={() => {}} />);
    await focusSearch();
    await act(async () => search().blur());
    expect(screen.queryByRole("listbox")).toBeNull();

    await focusSearch();
    expect(screen.getByRole("listbox")).toBeTruthy();
    keyDown("Escape");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(search().getAttribute("aria-expanded")).toBe("false");
    keyDown("ArrowDown");
    expect(screen.getByRole("listbox")).toBeTruthy();
  });
});

describe("ClientPicker - busca no servidor", () => {
  it("ao digitar: debounce (uma consulta so), resultados do servidor e o primeiro destacado", async () => {
    render(<Page onSubmit={() => {}} />);
    await focusSearch();
    fetchMock.mockClear();
    type("a");
    type("an");
    type("ana");
    expect(fetchMock).not.toHaveBeenCalled(); // ainda no debounce
    await settle();
    expect(searchCalls()).toEqual(["ana"]);

    const shown = options();
    expect(shown.map((o) => o.textContent)).toEqual(["Ana Souza", "Ana Paula"]);
    expect(screen.queryByText("Recentes")).toBeNull();
    expect(shown[0].getAttribute("aria-selected")).toBe("true");
    expect(shown[1].getAttribute("aria-selected")).toBe("false");
    expect(search().getAttribute("aria-activedescendant")).toBe(shown[0].id);
  });

  it("o termo vai ao servidor sem espacos nas pontas e com caracteres especiais codificados", async () => {
    render(<Page onSubmit={() => {}} />);
    await focusSearch();
    fetchMock.mockClear();
    type("  João & Cia  ");
    await settle();
    expect(String(fetchMock.mock.calls[0][0])).toBe(`/api/clientes/search?q=${encodeURIComponent("João & Cia")}`);
  });

  it("esvaziar o campo volta aos recentes sem esperar o debounce", async () => {
    render(<Page onSubmit={() => {}} />);
    await focusSearch();
    type("ana");
    await settle();
    type("");
    await flush();
    expect(screen.getByText("Recentes")).toBeTruthy();
    expect(options()).toHaveLength(3);
  });

  it("Enter antes de a busca chegar nao escolhe nada (nem o resultado da busca anterior)", async () => {
    let submitted = 0;
    render(<Page onSubmit={() => submitted++} />);
    await focusSearch();
    type("ana");
    await settle();
    expect(options()[0].textContent).toBe("Ana Souza");

    type("bru"); // resultados de "ana" nao valem mais
    expect(keyDown("Enter")).toBe(false);
    expect(screen.queryByText("Trocar")).toBeNull();
    expect(screen.getByText("Buscando...")).toBeTruthy();
    expect(submitted).toBe(0);
  });

  it("sem resultados: 'Nenhum cliente encontrado' e a acao Criar novo cliente; Enter nao faz nada", async () => {
    let submitted = 0;
    render(<Page onSubmit={() => submitted++} />);
    await focusSearch();
    type("zzz");
    await settle();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByText("Nenhum cliente encontrado")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Criar novo cliente/ })).toHaveLength(1); // so a acao da lista
    expect(search().getAttribute("aria-expanded")).toBe("false");
    expect(keyDown("Enter")).toBe(false);
    expect(screen.queryByText("Trocar")).toBeNull();
    expect(submitted).toBe(0);
  });

  it("falha na busca: mensagem discreta, sem quebrar o formulario", async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    render(<Page onSubmit={() => {}} />);
    await focusSearch();
    expect(screen.getByRole("alert").textContent).toBe("Não foi possível buscar clientes.");
  });
});

describe("ClientPicker - teclado (combobox)", () => {
  it("campo vazio: nada destacado e Enter nao seleciona nem envia", async () => {
    let submitted = 0;
    render(<Page onSubmit={() => submitted++} />);
    await focusSearch();
    expect(keyDown("Enter")).toBe(false); // tratado (preventDefault)
    expect(screen.queryByText("Trocar")).toBeNull();
    expect(submitted).toBe(0);
  });

  it("Setas mudam o destaque (com volta ao inicio/fim)", async () => {
    render(<Page onSubmit={() => {}} />);
    await focusSearch();
    type("ana");
    await settle();
    const [first, second] = options();
    keyDown("ArrowDown");
    expect(second.getAttribute("aria-selected")).toBe("true");
    keyDown("ArrowDown");
    expect(first.getAttribute("aria-selected")).toBe("true"); // volta ao inicio
    keyDown("ArrowUp");
    expect(second.getAttribute("aria-selected")).toBe("true"); // volta ao fim
    expect(search().getAttribute("aria-activedescendant")).toBe(second.id);
  });

  it("nos recentes, a seta destaca o primeiro e Enter o escolhe", async () => {
    render(<Page onSubmit={() => {}} />);
    await focusSearch();
    keyDown("ArrowDown");
    expect(options()[0].getAttribute("aria-selected")).toBe("true");
    keyDown("Enter");
    expect(screen.getByText("Recente Um")).toBeTruthy();
    expect(screen.getByText("Trocar")).toBeTruthy();
  });

  it("Enter seleciona o destacado, fecha a lista e move o foco para o proximo campo, sem enviar o formulario", async () => {
    let submitted = 0;
    render(<Page onSubmit={() => submitted++} />);
    await focusSearch();
    type("bru");
    await settle();
    expect(keyDown("Enter")).toBe(false);
    expect(screen.getByText("Bruno Lima")).toBeTruthy();
    expect(screen.getByText("Trocar")).toBeTruthy();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText("Adicionar serviço"));
    expect(submitted).toBe(0);
  });

  it("Enter com a seta escolhe o segundo resultado", async () => {
    render(<Page onSubmit={() => {}} />);
    await focusSearch();
    type("ana");
    await settle();
    keyDown("ArrowDown");
    keyDown("Enter");
    expect(screen.getByText("Ana Paula")).toBeTruthy();
    expect(screen.queryByText("Ana Souza")).toBeNull();
  });

  it("IME: Enter durante a composicao nao seleciona", async () => {
    render(<Page onSubmit={() => {}} />);
    await focusSearch();
    type("ana");
    await settle();
    expect(keyDown("Enter", { isComposing: true })).toBe(true);
    expect(screen.queryByText("Trocar")).toBeNull();
  });

  it("clique do mouse escolhe o cliente (e fecha a lista)", async () => {
    render(<Page onSubmit={() => {}} />);
    await focusSearch();
    fireEvent.click(screen.getByText("Recente Dois (Studio 2)"));
    expect(screen.getByText("Recente Dois")).toBeTruthy();
    expect(screen.getByText("Trocar")).toBeTruthy();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("cliente ja escolhido aparece com 'Trocar'; Trocar volta a busca com o foco nela", async () => {
    render(<Page onSubmit={() => {}} initialClient={{ id: "x", name: "Cliente Inicial", tradeName: "" }} />);
    expect(screen.getByText("Cliente Inicial")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Buscar cliente" })).toBeNull();
    fireEvent.click(screen.getByText("Trocar"));
    await flush();
    expect(document.activeElement).toBe(search());
  });
});

describe("ClientPicker - pop-up Criar novo cliente", () => {
  it("o link abre o MESMO pop-up de cadastro, em portal (fora do formulario do agendamento)", async () => {
    render(<Page onSubmit={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Criar novo cliente" }));
    const dialog = screen.getByRole("dialog");
    expect(screen.getByText("Novo cliente")).toBeTruthy();
    expect(screen.getByTestId("page-form").contains(dialog)).toBe(false); // portal: nao ha <form> dentro de <form>
    expect(within(dialog).getByLabelText("Telefone (opcional)")).toBeTruthy(); // formulario completo
    expect(within(dialog).getByLabelText("Nome")).toHaveProperty("value", "");
    await flush();
    expect(document.activeElement).toBe(within(dialog).getByLabelText("Nome"));
  });

  it("sem resultados, a acao da lista abre o pop-up com o Nome pre-preenchido com o texto buscado", async () => {
    render(<Page onSubmit={() => {}} />);
    await focusSearch();
    type("Carla Nova");
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Criar novo cliente" }));
    expect(within(screen.getByRole("dialog")).getByLabelText("Nome")).toHaveProperty("value", "Carla Nova");
  });

  it("salvar: fecha o pop-up, seleciona o novo cliente, foca o proximo campo e NAO envia o agendamento", async () => {
    let submitted = 0;
    render(<Page onSubmit={() => submitted++} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Criar novo cliente" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Nome"), { target: { value: "Carla Nova" } });
    fireEvent.change(within(dialog).getByLabelText("Telefone (opcional)"), { target: { value: "11 99999-0000" } });
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" })); });
    await flush();

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(post[0]).toBe("/api/clientes");
    expect(JSON.parse(post[1].body)).toMatchObject({ name: "Carla Nova", phone: "11 99999-0000" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Carla Nova")).toBeTruthy();
    expect(screen.getByText("Trocar")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Adicionar serviço"));
    expect(submitted).toBe(0); // o submit do pop-up nao chegou ao formulario da pagina
  });

  it("Enter dentro do pop-up so navega nele (nada chega ao formulario da pagina) e o Salvar envia so o cliente", async () => {
    let submitted = 0;
    render(<Page onSubmit={() => submitted++} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Criar novo cliente" }));
    const dialog = screen.getByRole("dialog");
    const name = within(dialog).getByLabelText("Nome");
    fireEvent.change(name, { target: { value: "Dora Enter" } });
    name.focus();
    expect(fireEvent.keyDown(name, { key: "Enter" })).toBe(false);
    expect(document.activeElement).toBe(within(dialog).getByLabelText("Nome fantasia (opcional)"));
    expect(submitted).toBe(0);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("cancelar: fecha o pop-up, devolve o foco a busca e nada e enviado", async () => {
    let submitted = 0;
    render(<Page onSubmit={() => submitted++} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Criar novo cliente" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(search());
    expect(screen.queryByText("Trocar")).toBeNull();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    expect(submitted).toBe(0);
  });

  it("erro ao salvar: o pop-up continua aberto com a mensagem e o cliente nao e selecionado", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === "POST" ? { ok: false, status: 400, json: async () => ({ error: "E-mail inválido." }) } : { ok: true, json: async () => ({ clients: [] }) }
    );
    render(<Page onSubmit={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Criar novo cliente" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Nome"), { target: { value: "Erro Silva" } });
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" })); });
    await flush();
    expect(within(screen.getByRole("dialog")).getByText("E-mail inválido.")).toBeTruthy();
    expect(screen.queryByText("Trocar")).toBeNull();
  });
});
