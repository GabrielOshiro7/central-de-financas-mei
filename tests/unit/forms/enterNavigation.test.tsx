// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { useEnterToNextField } from "@/components/forms/useEnterToNextField";

// Enter nos formularios: avanca, pula o que nao e campo, ENVIA uma vez no ultimo
// campo (requestSubmit no botao; click() num contenedor sem <form>), ignora o
// Enter com o envio pendente (botao desabilitado), respeita textarea e IME, e
// confirma o mini-formulario (nunca envia o da pagina).
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

describe("Enter navega e, no último campo, envia uma vez", () => {
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

  it("Enter num checkbox tambem so avanca (nao envia: ele nao e o ultimo campo)", () => {
    let submitted = 0;
    render(<Form onSubmit={() => submitted++} />);
    const checkbox = focusOn("Aceito");
    expect(enter(checkbox)).toBe(false);
    expect(document.activeElement).toBe(screen.getByLabelText("Categoria"));
    expect(submitted).toBe(0);
  });

  function Simple({ onSubmit, disabled = false }: { onSubmit: (submitter: Element | null) => void; disabled?: boolean }) {
    const enterNav = useEnterToNextField<HTMLFormElement>();
    return (
      <form {...enterNav} onSubmit={(e) => { e.preventDefault(); onSubmit((e.nativeEvent as SubmitEvent).submitter); }}>
        <input aria-label="A" />
        <input aria-label="B" />
        <button type="button">Cancelar</button>
        <button type="submit" disabled={disabled}>Enviar</button>
      </form>
    );
  }

  it("no ultimo campo do formulario, o Enter envia UMA vez (submitter = botao principal) e o foco fica no campo", () => {
    const submitters: (Element | null)[] = [];
    render(<Simple onSubmit={(s) => submitters.push(s)} />);
    focusOn("A");
    enter(screen.getByLabelText("A"));
    expect(document.activeElement).toBe(screen.getByLabelText("B"));
    expect(submitters).toHaveLength(0); // no meio do formulario so navega

    expect(enter(screen.getByLabelText("B"))).toBe(false); // preventDefault: o navegador nao dispara um 2o envio
    expect(submitters).toHaveLength(1);
    expect(submitters[0]).toBe(screen.getByRole("button", { name: "Enviar" }));
    expect(document.activeElement).toBe(screen.getByLabelText("B")); // o foco nao sai do campo

    // Enter com o foco no botao: comportamento nativo (nao e capturado).
    expect(enter(screen.getByRole("button", { name: "Enviar" }))).toBe(true);
  });

  it("formulario de um campo so: o primeiro Enter ja envia", () => {
    let submitted = 0;
    function One() {
      const enterNav = useEnterToNextField<HTMLFormElement>();
      return (
        <form {...enterNav} onSubmit={(e) => { e.preventDefault(); submitted++; }}>
          <input aria-label="E-mail" type="email" />
          <button type="submit">Enviar</button>
        </form>
      );
    }
    render(<One />);
    enter(focusOn("E-mail"));
    expect(submitted).toBe(1);
  });

  it("envio pendente (botao desabilitado): o Enter no ultimo campo e ignorado", () => {
    let submitted = 0;
    render(<Simple onSubmit={() => submitted++} disabled />);
    expect(enter(focusOn("B"))).toBe(false);
    expect(submitted).toBe(0);
  });

  it("Enter segurado no ultimo campo nao envia (so o primeiro Enter conta)", () => {
    let submitted = 0;
    render(<Simple onSubmit={() => submitted++} />);
    enter(focusOn("B"), { repeat: true });
    expect(submitted).toBe(0);
    enter(screen.getByLabelText("B"));
    expect(submitted).toBe(1);
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

  it("Enter no ultimo campo aciona o botao marcado com data-enter-submit, uma vez, sem tirar o foco do campo", () => {
    let confirmed = 0;
    render(<Modal onConfirm={() => confirmed++} />);
    const date = focusOn("Data");
    enter(date);
    expect(confirmed).toBe(1);
    expect(document.activeElement).toBe(date);
  });

  it("botao desabilitado (envio pendente): o Enter no ultimo campo nao faz nada", () => {
    let confirmed = 0;
    render(<Modal onConfirm={() => confirmed++} />);
    (screen.getByRole("button", { name: "Confirmar" }) as HTMLButtonElement).disabled = true;
    enter(focusOn("Data"));
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

// data-enter-skip: o campo marcado nao e alvo da navegacao por Enter (o popup de novo agendamento o usa no seletor
// "Adicionar servico" quando ja ha linhas: Enter no valor da ultima linha = Proximo, um Enter so).
describe("data-enter-skip", () => {
  function Step({ skip, onNext }: { skip: boolean; onNext: () => void }) {
    const enterNav = useEnterToNextField<HTMLDivElement>();
    return (
      <div {...enterNav}>
        <input aria-label="Valor" />
        <select aria-label="Adicionar" {...(skip ? { "data-enter-skip": "" } : {})}>
          <option value="">...</option>
        </select>
        <button type="button" data-enter-submit="" onClick={onNext}>
          Proximo
        </button>
      </div>
    );
  }

  it("com o atributo, o Enter no campo anterior pula o campo marcado e vai direto ao botao primario (um Enter so)", () => {
    let advanced = 0;
    render(<Step skip onNext={() => advanced++} />);
    expect(enter(focusOn("Valor"))).toBe(false);
    expect(advanced).toBe(1);
  });

  it("sem o atributo, o Enter no campo anterior vai ao proximo campo (o seletor) e so o segundo Enter avanca", () => {
    let advanced = 0;
    render(<Step skip={false} onNext={() => advanced++} />);
    enter(focusOn("Valor"));
    expect(advanced).toBe(0);
    expect(document.activeElement).toBe(screen.getByLabelText("Adicionar"));
    enter(screen.getByLabelText("Adicionar"));
    expect(advanced).toBe(1);
  });

  it("o campo marcado, quando e o unico, ainda faz o Enter avancar (sem linhas de servico, Enter no seletor = Proximo)", () => {
    let advanced = 0;
    function OnlySkipped() {
      const enterNav = useEnterToNextField<HTMLDivElement>();
      return (
        <div {...enterNav}>
          <select aria-label="Adicionar" data-enter-skip="">
            <option value="">...</option>
          </select>
          <button type="button" data-enter-submit="" onClick={() => advanced++}>
            Proximo
          </button>
        </div>
      );
    }
    render(<OnlySkipped />);
    enter(focusOn("Adicionar"));
    expect(advanced).toBe(1);
  });
});
