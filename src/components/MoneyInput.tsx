"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type ChangeEvent,
  type SyntheticEvent,
} from "react";
import type { Currency } from "@prisma/client";

// Campo monetario "mascara de centavos" (estilo apps bancarios): o usuario so
// digita digitos, eles empurram da direita para a esquerda, e o texto exibido
// e sempre recalculado a partir desse buffer de digitos - a formatacao e SO
// visual. O valor emitido em onChange e sempre uma string decimal limpa
// ("1234.50", "-500.00") ou "" (campo vazio), nunca a string formatada, entao
// os schemas Zod (z.coerce.number()) e os formularios consumidores nao mudam.
//
// Hidratacao: NADA aqui le API de navegador (window/document/DOM) durante o
// render - o texto exibido e derivado so das props. O DOM so e tocado dentro
// de handlers de evento e de effects (posicionar o cursor no fim), que nao
// rodam no servidor. Ver tests/unit/components/MoneyInput.ssr.test.tsx.

export type MoneyCurrency = Currency | null;

// Decimal(14, 2) no banco = ate 12 digitos inteiros + 2 casas. JPY nao tem
// casas decimais, entao o limite e so de digitos inteiros (12).
const MAX_DIGITS_WITH_CENTS = 14;
const MAX_DIGITS_INTEGER_ONLY = 12;

export function decimalsFor(currency: MoneyCurrency): 0 | 2 {
  return currency === "JPY" ? 0 : 2;
}

export function maxDigitsFor(currency: MoneyCurrency): number {
  return decimalsFor(currency) === 0 ? MAX_DIGITS_INTEGER_ONLY : MAX_DIGITS_WITH_CENTS;
}

export function symbolFor(currency: MoneyCurrency): string {
  if (currency === "BRL") return "R$";
  if (currency === "USD") return "US$";
  if (currency === "JPY") return "¥";
  return "";
}

// Remove zeros a esquerda. Buffer so de zeros ("000") vira "0" - o chamador
// decide se isso significa "zero digitado" ou "vazio" (ver applyTextChange).
function stripLeadingZeros(digits: string): string {
  const stripped = digits.replace(/^0+/, "");
  return stripped === "" && digits !== "" ? "0" : stripped;
}

// Valor de entrada (string decimal, tolerante: "45.9", "1500", "-3.5", "33.3",
// ""), ja no formato "canonico ou nao" que vem do Decimal.toString() do
// banco ou de round(...).toString() nos formularios -> buffer de digitos.
// Conversao por string/BigInt, nunca por float. Casas alem das suportadas
// pela moeda sao arredondadas (meio para cima); o banco nao gera isso, e um
// valor "1500.50" em JPY so chega aqui por troca de moeda, que o componente
// trata limpando o campo antes (ver efeito de troca de moeda abaixo).
export function valueToDigits(
  value: string,
  currency: MoneyCurrency
): { digits: string; negative: boolean } {
  const trimmed = value.trim();
  if (trimmed === "") return { digits: "", negative: false };

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;

  const match = /^(\d*)(?:\.(\d*))?$/.exec(unsigned);
  if (!match) {
    // Nao e um decimal simples (nao deveria acontecer); usa so os digitos.
    const raw = stripLeadingZeros(unsigned.replace(/\D/g, ""));
    return { digits: raw, negative: negative && raw !== "" && raw !== "0" };
  }

  const decimals = decimalsFor(currency);
  const intPart = match[1] ?? "";
  const fracPart = match[2] ?? "";
  if (intPart === "" && fracPart === "") return { digits: "", negative: false };

  const kept = fracPart.slice(0, decimals).padEnd(decimals, "0");
  const nextDigit = fracPart.charAt(decimals);
  let scaled = BigInt((intPart === "" ? "0" : intPart) + kept);
  if (nextDigit !== "" && nextDigit >= "5") scaled += BigInt(1);

  const digits = scaled.toString();
  const isZero = digits === "0";
  return { digits, negative: negative && !isZero };
}

// Buffer de digitos -> string decimal emitida ("1234.50", "-500.00", "1500").
// "" (buffer vazio) -> "". Nunca emite "-0.00".
export function digitsToValue(digits: string, negative: boolean, currency: MoneyCurrency): string {
  if (digits === "") return "";
  const normalized = stripLeadingZeros(digits);
  const decimals = decimalsFor(currency);
  const isZero = /^0+$/.test(normalized);
  const sign = negative && !isZero ? "-" : "";

  if (decimals === 0) return `${sign}${normalized}`;

  const padded = normalized.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, -decimals);
  const fracPart = padded.slice(-decimals);
  return `${sign}${intPart}.${fracPart}`;
}

// Buffer de digitos -> texto exibido, sempre no padrao brasileiro
// ("1.234,50", em qualquer moeda). Vazio -> "" (o placeholder aparece);
// "-" sozinho quando o usuario ja pediu sinal negativo mas nao digitou nada.
export function formatDigits(digits: string, negative: boolean, currency: MoneyCurrency): string {
  if (digits === "") return negative ? "-" : "";
  const value = digitsToValue(digits, negative, currency);
  const isNegative = value.startsWith("-");
  const unsigned = isNegative ? value.slice(1) : value;
  const [intPart, fracPart] = unsigned.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${isNegative ? "-" : ""}${grouped}${fracPart !== undefined ? `,${fracPart}` : ""}`;
}

export function valueToDisplay(value: string, currency: MoneyCurrency, pendingNegative = false): string {
  const { digits, negative } = valueToDigits(value, currency);
  return formatDigits(digits, negative || (digits === "" && pendingNegative), currency);
}

export type TextChangeResult = { value: string; digits: string; negative: boolean };

// Trata uma mudanca do <input> (digitar, backspace, apagar tudo, autocomplete,
// teclados IME) - tudo pelo mesmo caminho: pega os digitos do texto novo e
// recalcula. `previousText` e o que estava exibido antes da mudanca (serve so
// para distinguir "apaguei um digito" de "digitei um zero"). Retorna null
// quando a mudanca deve ser rejeitada (passaria do limite de digitos).
export function applyTextChange({
  text,
  previousText,
  currency,
  allowNegative,
}: {
  text: string;
  previousText: string;
  currency: MoneyCurrency;
  allowNegative: boolean;
}): TextChangeResult | null {
  const rawDigits = text.replace(/\D/g, "");
  const previousDigitCount = previousText.replace(/\D/g, "").length;

  // Sinal: 0 hifens = positivo; 1 = negativo; 2+ = o usuario digitou "-" com
  // o campo ja negativo (alterna de volta para positivo). Sem allowNegative,
  // hifen e ignorado.
  const minusCount = (text.match(/-/g) ?? []).length;
  const negative = allowNegative && minusCount === 1;

  // Zeros a esquerda nao contam para o limite (so o que sobra depois de
  // normalizar); um buffer so de zeros nunca estoura.
  let digits = stripLeadingZeros(rawDigits);
  if (digits === "0") {
    // "0,00" + backspace -> "0,0" (2 digitos, todos zero): apagou -> vazio.
    // "" + "0" -> "0" (1 digito): digitou um zero -> mantem "0".
    digits = rawDigits.length < previousDigitCount ? "" : "0";
  }

  if (digits.length > maxDigitsFor(currency)) return null;

  return { value: digitsToValue(digits, negative, currency), digits, negative };
}

const GROUPING_TEMPLATE = (sep: string) => new RegExp(`^\\d{1,3}(?:\\${sep}\\d{3})+$`);

// Interpreta texto colado como o numero decimal que ele ja representa:
// "1500", "1500.00", "1.500,00", "R$ 1.234,56", "1,500.00", "-50,5".
// Retorna a string decimal canonica ("1234.56") ou null se o texto nao for
// reconhecivel como numero (o chamador cai no fallback de extracao bruta).
//
// Regras de separadores:
// - Os dois presentes: o ULTIMO e o decimal, o outro e agrupamento de milhar.
// - So um tipo, varias vezes ("1.234.567"): agrupamento de milhar.
// - So um tipo, uma vez: "," e sempre decimal ("1500,5"); "." e agrupamento
//   quando seguido de exatamente 3 digitos e o inteiro tem 1-3 digitos sem
//   zero a esquerda ("1.500" = 1500, padrao pt-BR), senao e decimal
//   ("1500.5", "0.500", "10.5").
export function parsePastedMoney(text: string): string | null {
  let s = text
    .replace(/[\s ]/g, "")
    .replace(/R\$|US\$|BRL|USD|JPY/gi, "")
    .replace(/[$¥￥]/g, "")
    .replace(/−/g, "-");

  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }

  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const dotCount = (s.match(/\./g) ?? []).length;
  const commaCount = (s.match(/,/g) ?? []).length;

  let intPart: string;
  let fracPart = "";

  if (dotCount === 0 && commaCount === 0) {
    intPart = s;
  } else if (dotCount > 0 && commaCount > 0) {
    const decimalSep = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const groupSep = decimalSep === "." ? "," : ".";
    const pieces = s.split(decimalSep);
    if (pieces.length !== 2) return null;
    const [rawInt, rawFrac] = pieces;
    if (!GROUPING_TEMPLATE(groupSep).test(rawInt)) return null;
    intPart = rawInt.split(groupSep).join("");
    fracPart = rawFrac;
  } else {
    const sep = dotCount > 0 ? "." : ",";
    const count = dotCount > 0 ? dotCount : commaCount;
    if (count > 1) {
      if (!GROUPING_TEMPLATE(sep).test(s)) return null;
      intPart = s.split(sep).join("");
    } else {
      const [a, b] = s.split(sep);
      if (sep === "." && b.length === 3 && /^[1-9]\d{0,2}$/.test(a)) {
        intPart = a + b;
      } else {
        intPart = a;
        fracPart = b;
      }
    }
  }

  return `${negative ? "-" : ""}${intPart === "" ? "0" : intPart}${fracPart !== "" ? `.${fracPart}` : ""}`;
}

// Texto colado -> buffer (substitui o buffer inteiro, nunca concatena com o
// que ja estava digitado). Reconhece numeros (parsePastedMoney); se nao for
// reconhecivel, extrai so os digitos brutos. Retorna null se nao sobrar
// nenhum digito ou se passar do limite.
export function pasteToBuffer({
  text,
  currency,
  allowNegative,
}: {
  text: string;
  currency: MoneyCurrency;
  allowNegative: boolean;
}): TextChangeResult | null {
  const parsed = parsePastedMoney(text);

  let digits: string;
  let negative: boolean;
  if (parsed !== null) {
    ({ digits, negative } = valueToDigits(parsed, currency));
  } else {
    digits = stripLeadingZeros(text.replace(/\D/g, ""));
    negative = false;
  }

  if (digits === "") return null;
  if (digits.length > maxDigitsFor(currency)) return null;
  if (!allowNegative) negative = false;

  return { value: digitsToValue(digits, negative, currency), digits, negative };
}

// Valor com casas decimais nao-nulas (ex. "1500.50") nao cabe em moeda sem
// casas (JPY) - usado pela troca de moeda para decidir se limpa o campo.
function hasNonZeroFraction(value: string): boolean {
  return /\.\d*[1-9]/.test(value);
}

const wrapperBaseClass =
  "flex items-center border border-gray-300 text-sm text-gray-900 focus-within:border-gray-500 focus-within:ring-1 focus-within:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

export type MoneyInputProps = {
  id?: string;
  name?: string;
  // String decimal, tolerante ("45.9", "1500", "", "33.3") - nao precisa vir
  // canonica; o componente normaliza na leitura.
  value: string;
  // Sempre string decimal limpa ("1234.50" | "-500.00" | "1500" em JPY) ou "".
  onChange: (value: string) => void;
  currency: MoneyCurrency;
  allowNegative?: boolean;
  disabled?: boolean;
  placeholder?: string;
  // Classes extras do contenedor (largura etc.) - a borda/foco ja vem prontas.
  className?: string;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
  onBlur?: () => void;
};

export function MoneyInput({
  id,
  name,
  value,
  onChange,
  currency,
  allowNegative = false,
  disabled = false,
  placeholder,
  className,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  onBlur,
}: MoneyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previousCurrencyRef = useRef(currency);
  // "-" digitado (ou botao +/-) com o campo ainda vazio: nao ha valor
  // decimal que carregue o sinal, entao fica so aqui ate o primeiro digito.
  const [pendingNegative, setPendingNegative] = useState(false);

  const { digits, negative } = valueToDigits(value, currency);
  const effectiveNegative = allowNegative && (negative || (digits === "" && pendingNegative));
  const displayText = formatDigits(digits, effectiveNegative, currency);
  const symbol = symbolFor(currency);
  const defaultPlaceholder = decimalsFor(currency) === 0 ? "0" : "0,00";

  // Cursor sempre no fim depois de cada render em que o campo tem foco: o
  // campo nao tem "posicao de cursor" tradicional (o valor inteiro e
  // recalculado a cada tecla). Roda so no cliente, dentro de um effect.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (el && document.activeElement === el) {
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }
  });

  // Troca de moeda com valor ja digitado: se o valor tem casas que a nova
  // moeda nao suporta (ex. 1500.50 -> JPY), limpa o campo em vez de
  // arredondar em silencio (mudar dinheiro sem avisar e pior que pedir para
  // redigitar). Se cabe, mantem.
  useEffect(() => {
    if (previousCurrencyRef.current === currency) return;
    previousCurrencyRef.current = currency;
    if (decimalsFor(currency) === 0 && hasNonZeroFraction(value)) {
      // pendingNegative ja e false aqui: so existe com o buffer vazio, e este
      // valor tem digitos.
      onChange("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- so reage a troca de moeda
  }, [currency]);

  function commit(result: TextChangeResult) {
    setPendingNegative(result.negative && result.digits === "");
    onChange(result.value);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (disabled) return;
    const result = applyTextChange({
      text: event.target.value,
      previousText: displayText,
      currency,
      allowNegative,
    });
    // Rejeitado (estouraria o limite): o React reverte o DOM para o valor
    // controlado, entao nada muda na tela.
    if (result) commit(result);
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    if (disabled) return;
    const result = pasteToBuffer({
      text: event.clipboardData.getData("text"),
      currency,
      allowNegative,
    });
    if (result) commit(result);
  }

  // Com o cursor colapsado no meio do texto (clique/setas), digitar inseriria
  // digito no meio do buffer; o campo nao tem essa nocao, entao o cursor volta
  // para o fim. Selecao de um intervalo (ex. selecionar tudo para substituir)
  // e preservada.
  function handleSelect(event: SyntheticEvent<HTMLInputElement>) {
    const el = event.currentTarget;
    const end = el.value.length;
    if (el.selectionStart === el.selectionEnd && el.selectionStart !== end) {
      el.setSelectionRange(end, end);
    }
  }

  function toggleSign() {
    if (disabled) return;
    if (digits === "") {
      setPendingNegative((prev) => !prev);
      return;
    }
    onChange(digitsToValue(digits, !negative, currency));
  }

  return (
    <div className={`${wrapperBaseClass} ${disabled ? "opacity-60" : ""} ${className ?? ""}`}>
      {symbol && (
        <span aria-hidden="true" className="select-none pl-3 text-gray-500 dark:text-neutral-400">
          {symbol}
        </span>
      )}
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        value={displayText}
        placeholder={placeholder ?? defaultPlaceholder}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        onChange={handleChange}
        onPaste={handlePaste}
        onSelect={handleSelect}
        onBlur={onBlur}
        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-right outline-none disabled:cursor-not-allowed"
      />
      {allowNegative && (
        <button
          type="button"
          onClick={toggleSign}
          disabled={disabled}
          aria-label="Alternar sinal (positivo ou negativo)"
          aria-pressed={effectiveNegative}
          className="mr-1 px-2 py-1 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed dark:text-neutral-300 dark:hover:bg-neutral-700"
        >
          ±
        </button>
      )}
    </div>
  );
}

// Label + campo + mensagem de erro, no mesmo padrao visual do FormField.
export function MoneyField({
  label,
  error,
  id,
  ...inputProps
}: Omit<MoneyInputProps, "aria-invalid" | "aria-label"> & { label: string; error?: string; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-neutral-300">
        {label}
      </label>
      <MoneyInput id={id} {...inputProps} aria-invalid={Boolean(error)} className={`mt-1 ${inputProps.className ?? ""}`} />
      {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
