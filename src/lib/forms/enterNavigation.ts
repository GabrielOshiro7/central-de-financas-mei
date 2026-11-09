// Enter nos formularios: avanca para o proximo campo e NUNCA envia a partir de
// um campo; o envio e do botao final (clique, ou Enter/Espaco com o foco nele).
// Logica de DOM pura (sem React) - o hook que a liga a um <form> ou a um
// contenedor sem <form> (modais, assistentes) e useEnterToNextField.
//
// Regras:
// - Enter em input (texto, e-mail, senha, numero, data, valor) ou select ->
//   foco no proximo campo do mesmo contenedor, na ordem do DOM, pulando
//   desabilitados, somente leitura e ocultos. Checkbox, radio, botoes e links
//   nao sao alvos da navegacao (seguem funcionando com clique, Tab e Espaco).
// - Enter no ULTIMO campo -> foco no botao principal ([data-enter-submit], ou
//   o primeiro button[type=submit]), sem enviar.
// - textarea: Enter continua quebrando linha.
// - IME (japones, chines...): Enter durante a composicao pertence a conversao
//   do texto - nada e feito (isComposing, ou keyCode 229 do Safari).
// - Mini-formulario dentro de um formulario maior ([data-enter-group]): o
//   Enter navega so dentro dele e, no ultimo campo, CONFIRMA o mini-formulario
//   (clica no [data-enter-confirm] do grupo) - nunca o formulario da pagina.
// - Quem trata o Enter por conta propria (ex.: combobox de busca) chama
//   preventDefault antes: o evento chega aqui com defaultPrevented e e ignorado.

export const ENTER_GROUP_ATTR = "data-enter-group";
export const ENTER_CONFIRM_ATTR = "data-enter-confirm";
export const ENTER_SUBMIT_ATTR = "data-enter-submit";
export const ENTER_SKIP_ATTR = "data-enter-skip";
export const ENTER_ROOT_ATTR = "data-enter-root";

type FieldElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

// Inputs que nao sao "campo de entrada" para a navegacao.
const NON_FIELD_INPUT_TYPES = new Set(["hidden", "checkbox", "radio", "button", "submit", "reset", "file", "image", "range", "color"]);
// Elementos cujo Enter e nativo (ativar): a navegacao nunca os captura.
const NATIVE_ENTER_SELECTOR = 'button, a[href], summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"], input[type="submit"], input[type="button"], input[type="reset"], input[type="image"], input[type="file"]';

function isFieldElement(el: Element | null): el is FieldElement {
  if (!el) return false;
  if (el.tagName === "SELECT" || el.tagName === "TEXTAREA") return true;
  return el.tagName === "INPUT" && !NON_FIELD_INPUT_TYPES.has((el as HTMLInputElement).type);
}

function isCheckable(el: Element): boolean {
  return el.tagName === "INPUT" && ["checkbox", "radio"].includes((el as HTMLInputElement).type);
}

function isRendered(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true") return false;
    const style = view?.getComputedStyle(node);
    if (style && (style.display === "none" || style.visibility === "hidden")) return false;
  }
  return true;
}

function isNavigable(el: Element): el is FieldElement {
  if (!isFieldElement(el)) return false;
  if (el.hasAttribute(ENTER_SKIP_ATTR) || el.matches(":disabled")) return false;
  if ((el as HTMLInputElement | HTMLTextAreaElement).readOnly) return false;
  return isRendered(el);
}

function navigableFields(scope: Element): FieldElement[] {
  return Array.from(scope.querySelectorAll("input, select, textarea")).filter(isNavigable);
}

function scopeOf(target: Element, root: Element): Element {
  const group = target.closest(`[${ENTER_GROUP_ATTR}]`);
  return group && root.contains(group) && group !== root ? group : root;
}

const follows = (reference: Element, other: Element) => Boolean(reference.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING);

function findSubmitButton(root: Element): HTMLButtonElement | null {
  const candidates = Array.from(root.querySelectorAll<HTMLButtonElement>(`[${ENTER_SUBMIT_ATTR}], button[type="submit"]`));
  return candidates.find((button) => !button.disabled && isRendered(button)) ?? null;
}

export function isImeComposing(event: { isComposing?: boolean; keyCode?: number }): boolean {
  return event.isComposing === true || event.keyCode === 229;
}

export function handleEnterKeyDown(event: KeyboardEvent, root: HTMLElement): void {
  if (event.key !== "Enter") return;
  if (isImeComposing(event)) return;
  if (event.defaultPrevented) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target || !root.contains(target)) return;

  // textarea e campo editavel: Enter e quebra de linha.
  if (target.tagName === "TEXTAREA" || (target as HTMLElement).isContentEditable) return;

  // Enter segurado nao pode percorrer os campos ate o botao e envia-lo.
  if (event.repeat) {
    event.preventDefault();
    return;
  }

  // Botoes, links e afins: Enter nativo (ativar).
  if (target.matches(NATIVE_ENTER_SELECTOR)) return;
  if (!isFieldElement(target) && !isCheckable(target)) return;

  event.preventDefault();

  const scope = scopeOf(target, root);
  const next = navigableFields(scope).find((field) => field !== target && follows(target, field));
  if (next) {
    next.focus();
    return;
  }

  if (scope !== root) {
    // Ultimo campo do mini-formulario: confirma o mini-formulario.
    const confirm = scope.querySelector<HTMLButtonElement>(`[${ENTER_CONFIRM_ATTR}]`);
    if (confirm && !confirm.disabled) confirm.click();
    return;
  }

  findSubmitButton(root)?.focus();
}

// Foco no primeiro campo que vem DEPOIS de `anchor` (fora dele) - ex.: depois
// de escolher o cliente, vai para os servicos.
export function focusNextFieldAfter(anchor: Element, root?: Element | null): boolean {
  const container = root ?? anchor.closest(`form, [${ENTER_ROOT_ATTR}]`);
  if (!container) return false;
  const next = navigableFields(container).find((field) => !anchor.contains(field) && follows(anchor, field));
  if (!next) return false;
  next.focus();
  return true;
}

// enterkeyhint (teclado virtual): "next" nos campos que avancam e "done" no
// ultimo campo do contenedor (ou do mini-formulario). textarea fica de fora.
function setHint(field: FieldElement, hint: "next" | "done") {
  if (field.tagName === "TEXTAREA") return;
  if (field.getAttribute("enterkeyhint") !== hint) field.setAttribute("enterkeyhint", hint);
}

export function applyEnterKeyHint(field: Element, root: Element): void {
  if (!isNavigable(field)) return;
  const fields = navigableFields(scopeOf(field, root));
  setHint(field, fields[fields.length - 1] === field ? "done" : "next");
}

export function applyEnterKeyHints(root: Element): void {
  const apply = (scope: Element) => {
    const fields = navigableFields(scope);
    fields.forEach((field, index) => setHint(field, index === fields.length - 1 ? "done" : "next"));
  };
  apply(root);
  root.querySelectorAll(`[${ENTER_GROUP_ATTR}]`).forEach(apply);
}
