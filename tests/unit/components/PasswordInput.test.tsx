// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { FormField } from "@/components/FormField";

afterEach(cleanup);

describe("PasswordInput", () => {
  it("começa oculto e alterna type e aria-label a cada clique, sem aria-pressed", () => {
    render(<PasswordInput id="senha" aria-label="Senha" defaultValue="segredo1234" />);
    const input = screen.getByLabelText("Senha");
    const eye = screen.getByRole("button", { name: "Mostrar senha" });
    expect(input).toHaveAttribute("type", "password");
    expect(eye).not.toHaveAttribute("aria-pressed"); // o nome alterna; aria-pressed junto leria "Ocultar senha, pressionado"

    fireEvent.click(eye);
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("segredo1234"); // o texto nao se perde
    const hide = screen.getByRole("button", { name: "Ocultar senha" });
    expect(hide).not.toHaveAttribute("aria-pressed");

    fireEvent.click(hide);
    expect(input).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Mostrar senha" })).not.toHaveAttribute("aria-pressed");
  });

  it("o botão é type=button, aponta para o input (aria-controls) e tem o ícone escondido dos leitores de tela", () => {
    render(<PasswordInput id="senha" aria-label="Senha" />);
    const eye = screen.getByRole("button", { name: "Mostrar senha" });
    expect(eye).toHaveAttribute("type", "button");
    expect(eye).toHaveAttribute("aria-controls", "senha");
    expect(eye.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("sem id, gera um id e o aria-controls aponta para ele", () => {
    render(<PasswordInput aria-label="Senha" />);
    const input = screen.getByLabelText("Senha");
    expect(input.id).not.toBe("");
    expect(screen.getByRole("button", { name: "Mostrar senha" })).toHaveAttribute("aria-controls", input.id);
  });

  it("clicar no botão NÃO envia o formulário pai", () => {
    let submitted = 0;
    render(
      <form onSubmit={(e) => { e.preventDefault(); submitted++; }}>
        <PasswordInput aria-label="Senha" />
        <button type="submit">Entrar</button>
      </form>
    );
    fireEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    fireEvent.click(screen.getByRole("button", { name: "Ocultar senha" }));
    expect(submitted).toBe(0);
  });

  it("ao enviar o formulário, o campo volta para type=password", () => {
    render(
      <form onSubmit={(e) => e.preventDefault()}>
        <PasswordInput aria-label="Senha" />
        <button type="submit">Entrar</button>
      </form>
    );
    const input = screen.getByLabelText("Senha");
    fireEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(input).toHaveAttribute("type", "text");
    fireEvent.submit(input.closest("form")!);
    expect(input).toHaveAttribute("type", "password");
  });

  it("mantém name, autocomplete, required, minLength e aria do input", () => {
    render(
      <PasswordInput id="p" name="password" autoComplete="new-password" required minLength={10} aria-label="Senha" aria-describedby="dica" aria-invalid />
    );
    const input = screen.getByLabelText("Senha");
    expect(input).toHaveAttribute("name", "password");
    expect(input).toHaveAttribute("autocomplete", "new-password");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("minlength", "10");
    expect(input).toHaveAttribute("aria-describedby", "dica");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("deixa espaço à direita para o ícone e usa a cor de texto secundário (não o laranja de destaque)", () => {
    render(<PasswordInput aria-label="Senha" />);
    expect(screen.getByLabelText("Senha").className).toMatch(/\bpr-10\b/);
    const eyeClass = screen.getByRole("button", { name: "Mostrar senha" }).className;
    expect(eyeClass).toMatch(/text-ink-secondary/);
    expect(eyeClass).not.toMatch(/ember|d9541e|orange/i);
  });

  it("o clique do mouse mantém o foco no input e o cursor no lugar", () => {
    render(<PasswordInput aria-label="Senha" defaultValue="abcdefgh" />);
    const input = screen.getByLabelText("Senha") as HTMLInputElement;
    input.focus();
    input.setSelectionRange(3, 3);
    // detail: 1 = clique de mouse (0 seria teclado)
    fireEvent.click(screen.getByRole("button", { name: "Mostrar senha" }), { detail: 1 });
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([3, 3]);
  });

  it("ativado pelo teclado (detail 0), o foco continua no botão", () => {
    render(<PasswordInput aria-label="Senha" />);
    const eye = screen.getByRole("button", { name: "Mostrar senha" });
    eye.focus();
    fireEvent.click(eye, { detail: 0 });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ocultar senha" }));
  });
});

describe("FormField com type=password", () => {
  it("usa o PasswordInput (tem o botão de mostrar senha) e mantém label e atributos", () => {
    render(<FormField id="password" label="Senha" type="password" autoComplete="current-password" value="x" onChange={() => {}} />);
    const input = screen.getByLabelText("Senha");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "current-password");
    expect(input).toHaveAttribute("aria-required", "true");
    expect(screen.getByRole("button", { name: "Mostrar senha" })).toBeInTheDocument();
  });

  it("campos que não são de senha não ganham o botão", () => {
    render(<FormField id="email" label="E-mail" type="email" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
