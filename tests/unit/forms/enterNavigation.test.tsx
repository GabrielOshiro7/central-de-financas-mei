// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { useEnterToNextField } from "@/components/forms/useEnterToNextField";

// Enter nos formularios: avanca, pula o que nao e campo, vai ao botao no ultimo
// campo, nunca envia a partir de um campo, respeita textarea e IME, e confirma
// o mini-formulario (nunca o da pagina).
afterEach(cleanup);

function Form({ children, onSubmit, onConfirm }: { children?: React.ReactNode; onSubmit: () => void; onConfirm?: () => void }) {
  const enterNav = useEnterToNextField<HTMLFormElement>();
  const [, force] = useState(0);
  return (
    <form
      {...enterNav}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
        force((n) => n + 1);
      }}
    >
      <label>
        Nome <input aria-label="Nome" />
      </label>
      <input aria-label="E-mail" type="email" />
      <input aria-label="Desabilitado" disabled />
      <input aria-label="Somente leitura" readOnly />
      <input aria-label="Escondido" style={{ display: "none" }} />
      <div hidden>
        <input aria-label="Em bloco oculto" />
      </div>
      <input aria-label="Aceito" type="checkbox" />
      <button type="button">Secundario</button>
      <a href="/x">Link</a>
      <select aria-label="Categoria">
        <option value="a">A</option>
      </select>
      <textarea aria-label="Observacao" defaultValue="" />
      {children}
      <div data-enter-group="">
        <input aria-label="Nome do novo" />
        <input aria-label="Preco do novo" />
        <button type="button" data-enter-confirm="" onClick={onConfirm}>
          Criar novo
        </button>
      </div>
      <button type="submit">Salvar</button>
    </form>
  );
}

const enter = (el: Element, init: KeyboardEventInit = {}) => fireEvent.keyDown(el, { key: "Enter", ...init });
const focusOn = (label: string) => {
  const el = screen.getByLabelText(label);
  el.focus();
  return el;
};

describe("Enter navega, nunca envia", () => {
  it("avanca para o proximo campo, pulando desabilitado, somente leitura, oculto, checkbox, botao e link", () => {
    let submitted = 0;
    render(<Form onSubmit={() => submitted++} />);
    const name = focusOn("Nome");
    expect(enter(name)).toBe(false); // preventDefault: o navegador nao envia
    expect(document.activeElement).toBe(screen.getByLabelText("E-mail"));

    // E-mail -> (pula desabilitado, somente leitura, oculto, bloco oculto, checkbox, botao, link) -> select
    enter(screen.getByLabelText("E-mail"));
    expect(document.activeElement).toBe(screen.getByLabelText("Categoria"));
    enter(screen.getByLabelText("Categoria"));
    expect(document.activeElement).toBe(screen.getByLabelText("Observacao"));
    expect(submitted).toBe(0);
  });

  it("Enter num checkbox tambem so avanca (nao envia)", () => {
    let submitted = 0;
    render(<Form onSubmit={() => submitted++} />);
    const checkbox = focusOn("Aceito");
    expect(enter(checkbox)).toBe(false);
    expect(document.activeElement).toBe(screen.getByLabelText("Categoria"));
    expect(submitted).toBe(0);
  });

  it("no ultimo campo do formulario, o foco vai para o botao de envio, sem enviar", () => {
    let submitted = 0;
    function Simple() {
      const enterNav = useEnterToNextField<HTMLFormElement>();
      return (
        <form {...enterNav} onSubmit={(e) => { e.preventDefault(); submitted++; }}>
          <input aria-label="A" />
          <input aria-label="B" />
          <button type="submit">Enviar</button>
        </form>
      );
    }
    render(<Simple />);
    focusOn("A");
    enter(screen.getByLabelText("A"));
    expect(document.activeElement).toBe(screen.getByLabelText("B"));
    expect(enter(screen.getByLabelText("B"))).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Enviar" }));
    expect(submitted).toBe(0);

    // Enter com o foco no botao: comportamento nativo (nao e capturado).
    expect(enter(screen.getByRole("button", { name: "Enviar" }))).toBe(true);
  });

  it("textarea: Enter continua quebrando linha (nada e capturado)", () => {
    render(<Form onSubmit={() => {}} />);
    const textarea = focusOn("Observacao");
    expect(enter(textarea)).toBe(true); // sem preventDefault
    expect(document.activeElement).toBe(textarea);
  });

  it("IME: Enter durante a composicao (isComposing ou keyCode 229) nao faz nada", () => {
    render(<Form onSubmit={() => {}} />);
    const name = focusOn("Nome");
    expect(enter(name, { isComposing: true })).toBe(true);
    expect(document.activeElement).toBe(name);
    expect(enter(name, { keyCode: 229 })).toBe(true);
    expect(document.activeElement).toBe(name);
    // Depois da composicao, o Enter volta a navegar.
    enter(name);
    expect(document.activeElement).toBe(screen.getByLabelText("E-mail"));
  });

  it("Enter segurado (repeat) nao percorre os campos nem aciona o botao", () => {
    render(<Form onSubmit={() => {}} />);
    const name = focusOn("Nome");
    expect(enter(name, { repeat: true })).toBe(false);
    expect(document.activeElement).toBe(name);
    expect(enter(screen.getByRole("button", { name: "Salvar" }), { repeat: true })).toBe(false);
  });

  it("outras teclas nao sao tratadas", () => {
    render(<Form onSubmit={() => {}} />);
    const name = focusOn("Nome");
    expect(fireEvent.keyDown(name, { key: "a" })).toBe(true);
    expect(fireEvent.keyDown(name, { key: "Tab" })).toBe(true);
    expect(document.activeElement).toBe(name);
  });

  it("quem ja tratou o Enter (preventDefault, ex.: combobox) e respeitado", () => {
    function WithCombobox() {
      const enterNav = useEnterToNextField<HTMLFormElement>();
      return (
        <form {...enterNav}>
          <input aria-label="Busca" role="combobox" aria-expanded={false} aria-controls="lista" onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} />
          <input aria-label="Proximo" />
        </form>
      );
    }
    render(<WithCombobox />);
    const search = focusOn("Busca");
    enter(search);
    expect(document.activeElement).toBe(search);
  });
});

describe("mini-formulario (data-enter-group)", () => {
  it("Enter navega dentro do grupo e, no ultimo campo, confirma o mini-formulario (nunca envia o da pagina)", () => {
    let submitted = 0;
    let confirmed = 0;
    render(<Form onSubmit={() => submitted++} onConfirm={() => confirmed++} />);
    const first = focusOn("Nome do novo");
    enter(first);
    expect(document.activeElement).toBe(screen.getByLabelText("Preco do novo"));
    expect(confirmed).toBe(0);

    expect(enter(screen.getByLabelText("Preco do novo"))).toBe(false);
    expect(confirmed).toBe(1);
    expect(submitted).toBe(0);
  });

  it("botao de confirmacao desabilitado: Enter no ultimo campo do grupo nao faz nada", () => {
    let confirmed = 0;
    render(<Form onSubmit={() => {}} onConfirm={() => confirmed++} />);
    (screen.getByRole("button", { name: "Criar novo" }) as HTMLButtonElement).disabled = true;
    enter(focusOn("Preco do novo"));
    expect(confirmed).toBe(0);
  });

  it("o formulario da pagina entra no grupo na ordem do DOM (Observacao -> Nome do novo)", () => {
    render(<Form onSubmit={() => {}} />);
    // Observacao e textarea: Enter quebra linha; o campo anterior (Categoria) leva a Observacao.
    enter(focusOn("Categoria"));
    expect(document.activeElement).toBe(screen.getByLabelText("Observacao"));
  });
});

describe("contenedor sem <form> (modal)", () => {
  function Modal({ onConfirm }: { onConfirm: () => void }) {
    const enterNav = useEnterToNextField<HTMLDivElement>();
    return (
      <div {...enterNav} role="dialog">
        <input aria-label="Data" type="date" />
        <button type="button">Cancelar</button>
        <button type="button" data-enter-submit="" onClick={onConfirm}>
          Confirmar
        </button>
      </div>
    );
  }

  it("Enter no ultimo campo leva o foco ao botao marcado com data-enter-submit, sem acioná-lo", () => {
    let confirmed = 0;
    render(<Modal onConfirm={() => confirmed++} />);
    enter(focusOn("Data"));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Confirmar" }));
    expect(confirmed).toBe(0);
  });
});

describe("enterkeyhint (teclado virtual)", () => {
  it("next nos campos que avancam, done no ultimo campo do formulario e do mini-formulario; textarea intacta", () => {
    function Hints() {
      const enterNav = useEnterToNextField<HTMLFormElement>();
      return (
        <form {...enterNav}>
          <input aria-label="A" />
          <input aria-label="B" />
          <div data-enter-group="">
            <input aria-label="G1" />
            <input aria-label="G2" />
          </div>
          <input aria-label="Z" />
          <textarea aria-label="T" />
          <button type="submit">Ok</button>
        </form>
      );
    }
    render(<Hints />);
    const hint = (label: string) => screen.getByLabelText(label).getAttribute("enterkeyhint");
    expect([hint("A"), hint("B"), hint("G1"), hint("G2"), hint("Z")]).toEqual(["next", "next", "next", "done", "next"]);
    expect(screen.getByLabelText("T").hasAttribute("enterkeyhint")).toBe(false);
  });

  it("campos que aparecem depois da montagem recebem o hint ao ganhar foco", () => {
    function Later() {
      const enterNav = useEnterToNextField<HTMLFormElement>();
      const [open, setOpen] = useState(false);
      return (
        <form {...enterNav}>
          <input aria-label="A" />
          <button type="button" onClick={() => setOpen(true)}>
            Abrir
          </button>
          {open && <input aria-label="Novo" />}
        </form>
      );
    }
    render(<Later />);
    expect(screen.getByLabelText("A").getAttribute("enterkeyhint")).toBe("done");
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    screen.getByLabelText("Novo").focus();
    expect(screen.getByLabelText("Novo").getAttribute("enterkeyhint")).toBe("done");
    // O hint do primeiro e atualizado quando ele volta a ganhar foco.
    screen.getByLabelText("A").focus();
    expect(screen.getByLabelText("A").getAttribute("enterkeyhint")).toBe("next");
  });
});
