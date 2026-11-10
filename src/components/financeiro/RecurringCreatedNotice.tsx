"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import type { FinancialEntryType } from "@prisma/client";
import { formatDateKey } from "@/lib/time/zoned";

// Evento disparado pelo formulario de lancamento (TransactionFormModal) depois
// de criar um RECORRENTE a partir de uma aba. O usuario fica na aba e o periodo
// do filtro nao muda; esta mensagem explica o que aconteceu. Evento de janela
// porque o botao de criacao e esta mensagem ficam em pontos diferentes da
// pagina (o formulario vive num portal).
export const RECURRING_CREATED_EVENT = "recurring-entry-created";

type FutureDetail = { kind: "future"; type: FinancialEntryType; firstOn: string };
type PastDetail = { kind: "past"; type: FinancialEntryType; count: number; from: string; to: string; today: string };
type Detail = FutureDetail | PastDetail;

const LABEL: Record<FinancialEntryType, { noun: string; created: string }> = {
  REVENUE: { noun: "Receita", created: "criada" },
  COST: { noun: "Custo", created: "criado" },
  EXPENSE: { noun: "Despesa", created: "criada" },
};

// Aviso discreto (neutro, sem cor da paleta de status) na aba de Receitas/
// Custos/Despesas:
// - primeira ocorrencia futura: "Receita recorrente criada. A primeira entra em
//   DD/MM/AAAA." + "Ver em Recorrentes";
// - primeira ocorrencia antes do mes corrente (fora do periodo mostrado):
//   "N lançamentos criados, de DD/MM/AAAA a DD/MM/AAAA. Mostrando o período
//   atual." + "Ver todos", que so ao ser clicado aplica ?period=CUSTOM.
// Some ao fechar.
export function RecurringCreatedNotice({ type }: { type: FinancialEntryType }) {
  const pathname = usePathname();
  const [notice, setNotice] = useState<Detail | null>(null);

  useEffect(() => {
    function onCreated(event: Event) {
      const detail = (event as CustomEvent<Detail>).detail;
      if (detail.type === type) setNotice(detail);
    }
    window.addEventListener(RECURRING_CREATED_EVENT, onCreated);
    return () => window.removeEventListener(RECURRING_CREATED_EVENT, onCreated);
  }, [type]);

  if (!notice) return null;

  const linkClass = "font-medium text-gray-900 underline dark:text-neutral-100";

  return (
    <div
      role="status"
      data-testid="recurring-created-notice"
      className="flex flex-wrap items-center justify-between gap-3 border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
    >
      {notice.kind === "future" ? (
        <p>
          {LABEL[type].noun} recorrente {LABEL[type].created}. A primeira entra em {formatDateKey(notice.firstOn)}.{" "}
          <Link href="/financeiro/recorrentes" className={linkClass}>
            Ver em Recorrentes
          </Link>
        </p>
      ) : (
        <p>
          {notice.count === 1
            ? `1 lançamento criado em ${formatDateKey(notice.from)}.`
            : `${notice.count} lançamentos criados, de ${formatDateKey(notice.from)} a ${formatDateKey(notice.to)}.`}{" "}
          Mostrando o período atual.{" "}
          <Link
            href={`${pathname}?${new URLSearchParams({ period: "CUSTOM", start: notice.from, end: notice.today })}` as Route}
            onClick={() => setNotice(null)}
            className={linkClass}
          >
            Ver todos
          </Link>
        </p>
      )}
      <button
        type="button"
        onClick={() => setNotice(null)}
        className="text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400"
      >
        Fechar
      </button>
    </div>
  );
}
