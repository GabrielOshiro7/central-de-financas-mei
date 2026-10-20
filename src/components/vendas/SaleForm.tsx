"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Currency } from "@prisma/client";
import { FormField } from "@/components/FormField";
import { MoneyField, MoneyInput } from "@/components/MoneyInput";
import { SubmitButton } from "@/components/SubmitButton";
import { isIntegerCurrency } from "@/lib/money";
import { PAYMENT_METHOD_OPTIONS, SALE_DISCOUNT_TYPE_OPTIONS } from "@/lib/sales/options";

// Este componente e "use client" e NUNCA importa nada de @/lib/sales/
// calculations ou qualquer modulo que importe `Prisma` como VALOR (so
// `import type { Currency }` do @prisma/client, que e apagado em tempo de
// compilacao) - o pacote gerado do Prisma e Node-only e nao deve entrar no
// bundle do navegador. Os calculos de previa aqui embaixo sao uma segunda
// implementacao deliberadamente simples (numeros de ponto flutuante, so para
// UX) - o backend SEMPRE recalcula com Decimal e nunca confia neste valor
// (mesmo padrao de "o servidor recalcula" ja documentado no restante do
// projeto).

export type ClientOption = { id: string; name: string; tradeName: string };
export type CategoryOption = { id: string; name: string };
export type ProductOption = { id: string; name: string; defaultPrice: string };

export type SaleFormItem = { productId: string; description: string; quantity: string; unitPrice: string };
export type SaleFormInstallment = { dueDateInput: string; amount: string };

export type SaleFormInitial = {
  id: string;
  clientId: string;
  categoryId: string;
  saleDateInput: string;
  items: SaleFormItem[];
  discountType: "" | "FIXED" | "PERCENTAGE";
  discountValue: string;
  paymentMethod: string;
  notes: string;
  status: "DRAFT" | "CONFIRMED";
  installments: SaleFormInstallment[];
};

function todayInputValue(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysInput(dateInput: string, days: number): string {
  const [y, m, d] = dateInput.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function SaleForm({
  mode,
  initial,
  clients,
  categories,
  products,
  currency,
}: {
  mode: "create" | "edit";
  initial?: SaleFormInitial;
  clients: ClientOption[];
  categories: CategoryOption[];
  products: ProductOption[];
  currency: Currency;
}) {
  const router = useRouter();
  const isEditingConfirmed = mode === "edit" && initial?.status === "CONFIRMED";
  const decimals = isIntegerCurrency(currency) ? 0 : 2;

  const [clientRequestId] = useState(() => crypto.randomUUID());
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [saleDate, setSaleDate] = useState(initial?.saleDateInput ?? todayInputValue());
  // Chave/id de cada linha e SEMPRE derivada do indice no array, nunca de um
  // contador global (`let x = 0; x++`) ou de `crypto.randomUUID()` gerado
  // durante o render: qualquer um dos dois produziria um valor diferente na
  // passagem de SSR (executada no processo Node do servidor, onde o modulo
  // fica em memoria e o contador NAO reseta entre requisicoes) e na
  // hidratacao no navegador (JS bundle novo, contador reinicia em zero) -
  // isso e exatamente o que causa o erro "A tree hydrated but some
  // attributes... didn't match" do React. Indice e deriva de `items`/
  // `initial`, que sao os mesmos em ambas as passagens.
  const [items, setItems] = useState<SaleFormItem[]>(
    () => initial?.items ?? [{ productId: "", description: "", quantity: "1", unitPrice: "" }]
  );
  const [discountType, setDiscountType] = useState<"" | "FIXED" | "PERCENTAGE">(initial?.discountType ?? "");
  const [discountValue, setDiscountValue] = useState(initial?.discountValue ?? "");
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [paymentTiming, setPaymentTiming] = useState<"AVISTA" | "APRAZO">(
    initial && initial.installments.length > 1 ? "APRAZO" : "AVISTA"
  );
  const [installments, setInstallments] = useState<SaleFormInstallment[]>(
    () => initial?.installments ?? [{ dueDateInput: todayInputValue(), amount: "" }]
  );
  const [installmentCount, setInstallmentCount] = useState(2);
  const [installmentIntervalDays, setInstallmentIntervalDays] = useState(30);

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [savingProductIndex, setSavingProductIndex] = useState<number | null>(null);
  const [productSaveError, setProductSaveError] = useState<string | null>(null);

  const showPaymentSection = mode === "create" || isEditingConfirmed;

  const totals = useMemo(() => {
    const itemTotals = items.map((item) => (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0));
    const subtotal = itemTotals.reduce((t, v) => t + v, 0);
    let discountAmount = 0;
    if (discountType === "PERCENTAGE") discountAmount = (subtotal * (Number(discountValue) || 0)) / 100;
    else if (discountType === "FIXED") discountAmount = Number(discountValue) || 0;
    const total = round(subtotal - discountAmount, decimals);
    return { subtotal: round(subtotal, decimals), discountAmount: round(discountAmount, decimals), total };
  }, [items, discountType, discountValue, decimals]);

  const installmentsSum = round(
    installments.reduce((t, i) => t + (Number(i.amount) || 0), 0),
    decimals
  );

  function updateItem(index: number, patch: Partial<SaleFormItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, { productId: "", description: "", quantity: "1", unitPrice: "" }]);
  }

  function removeItem(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  function handleProductSelect(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    updateItem(index, {
      productId,
      description: product ? product.name : "",
      unitPrice: product?.defaultPrice ?? "",
    });
  }

  // Fecha o loop do catalogo minimo de produtos (Etapa 6): um item digitado
  // manualmente pode ser salvo como Product (POST /api/produtos) para
  // reaproveitar em vendas futuras - sem isso, a lista de produtos do
  // seletor acima nunca cresceria e a rota/mutation de criacao ficariam
  // mortas (nunca chamadas por nenhuma tela).
  async function saveItemAsProduct(index: number) {
    const item = items[index];
    if (!item.description.trim()) return;

    setSavingProductIndex(index);
    setProductSaveError(null);
    try {
      const res = await fetch("/api/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: item.description, defaultPrice: item.unitPrice || undefined }),
      });
      const result = await res.json();
      if (!res.ok) {
        setProductSaveError(result.error ?? "Não foi possível salvar o produto.");
        return;
      }
      updateItem(index, { productId: result.id });
      router.refresh();
    } catch {
      setProductSaveError("Erro de conexão. Tente novamente.");
    } finally {
      setSavingProductIndex(null);
    }
  }

  function applyEqualSplit() {
    const count = Math.max(1, installmentCount);
    const base = round(totals.total / count, decimals);
    const rows: SaleFormInstallment[] = Array.from({ length: count }, (_, index) => ({
      dueDateInput: addDaysInput(saleDate, installmentIntervalDays * index),
      amount: base.toString(),
    }));
    const allocated = round(base * count, decimals);
    const remainder = round(totals.total - allocated, decimals);
    rows[rows.length - 1].amount = round(base + remainder, decimals).toString();
    setInstallments(rows);
  }

  function updateInstallment(index: number, patch: Partial<SaleFormInstallment>) {
    setInstallments((prev) => prev.map((i, idx) => (idx === index ? { ...i, ...patch } : i)));
  }

  function addInstallment() {
    setInstallments((prev) => [...prev, { dueDateInput: todayInputValue(), amount: "" }]);
  }

  function removeInstallment(index: number) {
    setInstallments((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  // `status` só é relevante no modo "create" (DRAFT vs CONFIRMED direto na
  // criação) - em "edit" a venda já tem seu status e o valor passado aqui é
  // ignorado (updateSale nunca recebe/altera status; ver confirmSale para a
  // transição DRAFT -> CONFIRMED, que é uma ação separada na tela de detalhe).
  // Em modo "create" + à vista, o editor de parcelas nem aparece na tela
  // (a condicao de renderizacao logo abaixo so mostra o editor em
  // mode==="edit" ou paymentTiming==="APRAZO") - por isso a parcela unica
  // NUNCA vem do estado `installments` (que ficaria parada em "" desde o
  // mount) e sim sempre recalculada aqui a partir do total atual. Isso evita
  // depender de o usuario "reclicar" um botão À vista que já vem selecionado
  // por padrão.
  function effectiveInstallments(): { dueDateInput: string; amount: string }[] {
    if (mode === "create" && paymentTiming === "AVISTA") {
      return [{ dueDateInput: saleDate, amount: totals.total.toString() }];
    }
    return installments;
  }

  async function submit(status: "DRAFT" | "CONFIRMED") {
    setError(null);

    if (!clientId) return setError("Selecione um cliente.");
    if (!categoryId) return setError("Selecione uma categoria.");
    if (items.some((item) => !item.description.trim() || !item.quantity || !item.unitPrice)) {
      return setError("Preencha descrição, quantidade e preço unitário de todos os itens.");
    }

    const wantsBills = mode === "create" ? status === "CONFIRMED" : isEditingConfirmed;
    const finalInstallments = effectiveInstallments();
    if (wantsBills) {
      if (finalInstallments.some((i) => !i.dueDateInput || !i.amount)) {
        return setError("Preencha vencimento e valor de todas as parcelas.");
      }
      const finalSum = round(
        finalInstallments.reduce((t, i) => t + (Number(i.amount) || 0), 0),
        decimals
      );
      if (finalSum !== totals.total) {
        return setError(`A soma das parcelas (${finalSum}) não bate com o total da venda (${totals.total}).`);
      }
    }

    setPending(true);
    try {
      const itemsPayload = items.map((item) => ({
        productId: item.productId || undefined,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      }));

      if (mode === "create") {
        const payload = {
          clientRequestId,
          status,
          clientId,
          categoryId,
          saleDate,
          items: itemsPayload,
          discountType: discountType || undefined,
          discountValue: discountType ? discountValue : undefined,
          paymentMethod: paymentMethod || undefined,
          installments:
            status === "CONFIRMED"
              ? finalInstallments.map((i, index) => ({
                  dueDate: i.dueDateInput,
                  amount: i.amount,
                  paidNow: paymentTiming === "AVISTA" && finalInstallments.length === 1 && index === 0,
                }))
              : undefined,
          notes: notes || undefined,
        };
        const res = await fetch("/api/vendas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (!res.ok) {
          setError(result.error ?? "Não foi possível salvar a venda.");
          return;
        }
        router.push(`/vendas/${result.id}`);
        router.refresh();
      } else {
        const payload = {
          clientId,
          categoryId,
          saleDate,
          items: itemsPayload,
          discountType: discountType || undefined,
          discountValue: discountType ? discountValue : undefined,
          paymentMethod: paymentMethod || undefined,
          installments: isEditingConfirmed ? installments.map((i) => ({ dueDate: i.dueDateInput, amount: i.amount })) : undefined,
          notes: notes || undefined,
        };
        const res = await fetch(`/api/vendas/${initial!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (!res.ok) {
          setError(result.error ?? "Não foi possível salvar a venda.");
          return;
        }
        router.push(`/vendas/${initial!.id}`);
        router.refresh();
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  // O <form> so existe para permitir Enter-to-submit nos campos de texto; o
  // botao "Salvar rascunho" e type="button" com seu proprio onClick (nunca
  // deve disparar isto). O submit "de verdade" (Confirmar venda / Salvar
  // alteracoes) sempre chama submit("CONFIRMED") - em modo "edit" o valor de
  // status e ignorado (ver comentario em submit()).
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit("CONFIRMED");
  }

  const inputClass =
    "w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
  const labelClass = "mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <section className="border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-neutral-100">Informações</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="clientId" className={labelClass}>
              Cliente
            </label>
            <select id="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputClass}>
              <option value="">Selecione...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.tradeName ? ` (${c.tradeName})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="categoryId" className={labelClass}>
              Categoria (receita)
            </label>
            <select id="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
              <option value="">Selecione...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <FormField id="saleDate" label="Data da venda" type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
        </div>
      </section>

      <section className="border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Itens</h2>
          <button type="button" onClick={addItem} className="text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400">
            + Adicionar item
          </button>
        </div>

        {productSaveError && (
          <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
            {productSaveError}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-1 gap-2 border border-gray-200 p-3 lg:grid-cols-12 lg:items-end dark:border-neutral-700">
              <div className="lg:col-span-3">
                <label htmlFor={`product-${index}`} className={labelClass}>
                  Produto/serviço (opcional)
                </label>
                <select
                  id={`product-${index}`}
                  value={item.productId}
                  onChange={(e) => handleProductSelect(index, e.target.value)}
                  className={inputClass}
                >
                  <option value="">Digitar manualmente</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {!item.productId && item.description.trim() && (
                  <button
                    type="button"
                    onClick={() => saveItemAsProduct(index)}
                    disabled={savingProductIndex === index}
                    className="mt-1 text-xs font-medium text-gray-500 hover:underline disabled:opacity-50 dark:text-neutral-400"
                  >
                    {savingProductIndex === index ? "Salvando..." : "+ Salvar como produto"}
                  </button>
                )}
              </div>
              <div className="lg:col-span-3">
                <label htmlFor={`description-${index}`} className={labelClass}>
                  Descrição
                </label>
                <input
                  id={`description-${index}`}
                  value={item.description}
                  onChange={(e) => updateItem(index, { description: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="lg:col-span-2">
                <label htmlFor={`quantity-${index}`} className={labelClass}>
                  Quantidade
                </label>
                <input
                  id={`quantity-${index}`}
                  type="number"
                  min={0}
                  step={0.01}
                  value={item.quantity}
                  onChange={(e) => updateItem(index, { quantity: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="lg:col-span-3">
                <label htmlFor={`unitPrice-${index}`} className={labelClass}>
                  Preço unitário
                </label>
                <MoneyInput
                  id={`unitPrice-${index}`}
                  currency={currency}
                  value={item.unitPrice}
                  onChange={(value) => updateItem(index, { unitPrice: value })}
                />
              </div>
              <div className="lg:col-span-1">
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  disabled={items.length === 1}
                  className="text-sm font-medium text-red-600 hover:underline disabled:opacity-40 dark:text-red-400"
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="discountType" className={labelClass}>
              Desconto (opcional)
            </label>
            <select
              id="discountType"
              value={discountType}
              onChange={(e) => {
                const next = e.target.value as "" | "FIXED" | "PERCENTAGE";
                // O mesmo estado guarda "10" (%) ou "10.00" (valor): trocar de
                // tipo com algo digitado reinterpretaria o numero (10% viraria
                // R$ 10,00, ou 12.5% em JPY nem seria um valor valido), entao
                // limpa. So limpa em troca real de tipo com valor ja digitado.
                if (next !== discountType && discountType !== "" && next !== "") setDiscountValue("");
                setDiscountType(next);
              }}
              className={inputClass}
            >
              <option value="">Sem desconto</option>
              {SALE_DISCOUNT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {discountType === "PERCENTAGE" && (
            <FormField
              id="discountValue"
              label="Percentual (%)"
              type="number"
              min={0}
              step={decimals === 0 ? 1 : 0.01}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
            />
          )}
          {discountType === "FIXED" && (
            <MoneyField
              id="discountValue"
              label="Valor do desconto"
              currency={currency}
              value={discountValue}
              onChange={setDiscountValue}
            />
          )}
        </div>

        <div className="mt-4 flex flex-col gap-1 bg-gray-50 p-4 text-sm dark:bg-neutral-800">
          <div className="flex justify-between text-gray-600 dark:text-neutral-400">
            <span>Subtotal</span>
            <span>{totals.subtotal}</span>
          </div>
          <div className="flex justify-between text-gray-600 dark:text-neutral-400">
            <span>Desconto</span>
            <span>{totals.discountAmount}</span>
          </div>
          <div className="flex justify-between text-base font-semibold text-gray-900 dark:text-neutral-100">
            <span>Total</span>
            <span>{totals.total}</span>
          </div>
        </div>
      </section>

      {showPaymentSection && (
        <section className="border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-neutral-100">Pagamento</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="paymentMethod" className={labelClass}>
                Forma de pagamento (opcional)
              </label>
              <select id="paymentMethod" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputClass}>
                <option value="">Não informado</option>
                {PAYMENT_METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {mode === "create" && (
              <div>
                <label className={labelClass}>Condição</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentTiming("AVISTA");
                      setInstallments([{ dueDateInput: saleDate, amount: totals.total.toString() }]);
                    }}
                    className={`flex-1 px-3 py-2 text-sm font-medium transition ${
                      paymentTiming === "AVISTA"
                        ? "bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-neutral-800 dark:text-neutral-400"
                    }`}
                  >
                    À vista
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentTiming("APRAZO")}
                    className={`flex-1 px-3 py-2 text-sm font-medium transition ${
                      paymentTiming === "APRAZO"
                        ? "bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-neutral-800 dark:text-neutral-400"
                    }`}
                  >
                    A prazo
                  </button>
                </div>
              </div>
            )}
          </div>

          {(mode === "edit" || paymentTiming === "APRAZO") && (
            <div className="mt-4">
              {mode === "create" && (
                <div className="mb-3 flex flex-wrap items-end gap-3 bg-gray-50 p-3 dark:bg-neutral-800">
                  <div>
                    <label htmlFor="installmentCount" className={labelClass}>
                      Nº de parcelas
                    </label>
                    <input
                      id="installmentCount"
                      type="number"
                      min={1}
                      value={installmentCount}
                      onChange={(e) => setInstallmentCount(Number(e.target.value))}
                      className={`${inputClass} w-24`}
                    />
                  </div>
                  <div>
                    <label htmlFor="installmentIntervalDays" className={labelClass}>
                      Intervalo (dias)
                    </label>
                    <input
                      id="installmentIntervalDays"
                      type="number"
                      min={1}
                      value={installmentIntervalDays}
                      onChange={(e) => setInstallmentIntervalDays(Number(e.target.value))}
                      className={`${inputClass} w-24`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={applyEqualSplit}
                    className="border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-700"
                  >
                    Dividir igualmente
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-2">
                {installments.map((installment, index) => (
                  <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-end">
                    <div className="sm:col-span-5">
                      <label htmlFor={`due-${index}`} className={labelClass}>
                        Vencimento
                      </label>
                      <input
                        id={`due-${index}`}
                        type="date"
                        value={installment.dueDateInput}
                        onChange={(e) => updateInstallment(index, { dueDateInput: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div className="sm:col-span-5">
                      <label htmlFor={`amount-${index}`} className={labelClass}>
                        Valor
                      </label>
                      <MoneyInput
                        id={`amount-${index}`}
                        currency={currency}
                        value={installment.amount}
                        onChange={(value) => updateInstallment(index, { amount: value })}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={() => removeInstallment(index)}
                        disabled={installments.length === 1}
                        className="text-sm font-medium text-red-600 hover:underline disabled:opacity-40 dark:text-red-400"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between text-sm">
                <button type="button" onClick={addInstallment} className="font-medium text-gray-600 hover:underline dark:text-neutral-400">
                  + Adicionar parcela
                </button>
                <span className={installmentsSum === totals.total ? "text-gray-500 dark:text-neutral-400" : "font-semibold text-rose-600 dark:text-rose-400"}>
                  Soma das parcelas: {installmentsSum} / {totals.total}
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <label htmlFor="notes" className={labelClass}>
          Observações (opcional)
        </label>
        <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputClass} />
      </section>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {mode === "create" ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => submit("DRAFT")}
              className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Salvar rascunho
            </button>
            <div className="flex-1">
              <SubmitButton pending={pending} pendingText="Salvando...">
                Confirmar venda
              </SubmitButton>
            </div>
          </>
        ) : (
          <div className="flex-1">
            <SubmitButton pending={pending} pendingText="Salvando...">
              Salvar alterações
            </SubmitButton>
          </div>
        )}
      </div>
    </form>
  );
}
