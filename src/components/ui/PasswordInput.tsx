"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type MouseEvent } from "react";
import { Eye, EyeOff } from "lucide-react";

// Campo de senha com botao "mostrar/ocultar". Usado em TODOS os campos de senha do app (via FormField, que
// delega a este componente quando type="password").
//  - O botao e type="button" (nunca envia o formulario), alcancavel por Tab, com aria-label
//    "Mostrar senha"/"Ocultar senha" (o NOME alterna; sem aria-pressed - os dois juntos fariam o leitor de tela
//    dizer "Ocultar senha, pressionado") e aria-controls apontando para o input.
//  - Com o mouse/toque, o foco FICA no input e o cursor nao muda de posicao (o texto nunca se perde). Com o
//    teclado (Enter/Espaco no botao) o foco fica no proprio botao: quem tabulou ate ele continua dali.
//  - Ao enviar o formulario o campo volta a type="password" (o gerenciador de senhas do navegador salva normalmente).
//  - name, id, autoComplete, required, minLength e demais atributos do input passam intactos.
//  - Icone na cor de texto secundario (token ink-secondary: #5B554B no claro, #A3A6AA no escuro), sem o laranja
//    de destaque; foco visivel com o mesmo contorno dos outros botoes de icone do app.
//  - O olho nativo do Edge/IE (::-ms-reveal, ::-ms-clear) e escondido em globals.css (data-password-input).
export const PASSWORD_INPUT_CLASS =
  "w-full border border-gray-300 py-2 pr-10 pl-3 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

export type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  // Classes do contenedor (margem acima, etc.). Padrao: "mt-1" (o mesmo espacamento dos campos do FormField).
  wrapperClassName?: string;
};

export function PasswordInput({ id, className, wrapperClassName = "mt-1", ...inputProps }: PasswordInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);
  // Selecao/foco a restaurar depois da troca de type (so quando o clique veio do mouse/toque).
  const restore = useRef<{ start: number | null; end: number | null } | null>(null);

  // Ao enviar o formulario, a senha volta a ficar oculta.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const hide = () => setVisible(false);
    form.addEventListener("submit", hide);
    return () => form.removeEventListener("submit", hide);
  }, []);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const saved = restore.current;
    if (!input || !saved) return;
    restore.current = null;
    const apply = () => {
      input.focus({ preventScroll: true });
      if (saved.start !== null && saved.end !== null) input.setSelectionRange(saved.start, saved.end);
    };
    apply();
    // Alguns navegadores zeram a selecao depois que o type muda (password <-> text): reaplica no proximo quadro.
    const frame = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  function toggle(event: MouseEvent<HTMLButtonElement>) {
    const input = inputRef.current;
    // detail === 0: ativado pelo teclado (Enter/Espaco). Mouse e toque: detail >= 1.
    const fromKeyboard = event.detail === 0;
    if (input && !fromKeyboard) restore.current = { start: input.selectionStart, end: input.selectionEnd };
    setVisible((current) => !current);
  }

  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        {...inputProps}
        ref={inputRef}
        id={inputId}
        type={visible ? "text" : "password"}
        data-password-input=""
        className={className ?? PASSWORD_INPUT_CLASS}
      />
      <button
        type="button"
        // Clicar no olho nao tira o foco do campo (o mousedown padrao moveria o foco para o botao).
        onMouseDown={(event) => event.preventDefault()}
        onClick={toggle}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-controls={inputId}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-secondary transition-colors hover:text-foreground focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-current"
      >
        {visible ? <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" /> : <Eye size={18} strokeWidth={1.75} aria-hidden="true" />}
      </button>
    </div>
  );
}
