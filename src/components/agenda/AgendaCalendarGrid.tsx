"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { shiftDateKey } from "@/lib/agenda/calendar";

export type CalendarDayCell = {
  dateKey: string; // "YYYY-MM-DD"
  dayNumber: number;
  hasAppointment: boolean;
  appointmentCount: number;
  // "2 de outubro de 2026" - formatado no servidor (Intl, pt-BR) pra este
  // componente nunca precisar formatar data/mes por extenso sozinho.
  fullDateLabel: string;
};

const WEEKDAY_HEADERS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const MONTH_ABBREVIATIONS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function keyToYearMonth(key: string): { year: number; month: number } {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m };
}

export function AgendaCalendarGrid({
  year,
  month,
  monthLabel,
  weeks,
  todayKey,
  selectedKey,
}: {
  year: number;
  month: number;
  monthLabel: string;
  weeks: (CalendarDayCell | null)[][];
  todayKey: string;
  selectedKey: string | null;
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Inicializado so quando o seletor abre (no handler de clique, nao num
  // efeito) - nao precisa re-sincronizar com `year` depois disso, o usuario
  // esta deliberadamente navegando dentro do proprio seletor.
  const [pickerYear, setPickerYear] = useState(year);
  // Lazy init (sem efeito) - reseta sozinho porque o componente e remontado
  // com uma `key` nova (ver chamador em page.tsx) sempre que mes/dia
  // selecionado mudam de verdade (sempre via navegacao real, nunca so um
  // re-render com os mesmos dados).
  const [focusedKey, setFocusedKey] = useState<string>(() => selectedKey ?? todayKey);
  const gridRef = useRef<HTMLDivElement>(null);

  function openPicker() {
    setPickerYear(year);
    setPickerOpen(true);
  }

  function navigate(params: { year: number; month: number; day?: string | null }) {
    const search = new URLSearchParams();
    search.set("view", "calendar");
    search.set("month", `${String(params.year).padStart(4, "0")}-${String(params.month).padStart(2, "0")}`);
    if (params.day) search.set("day", params.day);
    router.push(`/agenda?${search.toString()}`);
  }

  function goToMonth(targetYear: number, targetMonth: number) {
    // Mesma regra do carregamento inicial (secao 4 do redesign): ao trocar de
    // mes, seleciona hoje se ele cair no mes exibido; senao, nenhuma selecao
    // (deixa o servidor decidir - nunca duplica essa checagem aqui).
    const [todayYear, todayMonth] = todayKey.split("-").map(Number);
    const day = targetYear === todayYear && targetMonth === todayMonth ? todayKey : null;
    navigate({ year: targetYear, month: targetMonth, day });
  }

  function goToPreviousMonth() {
    const targetMonth = month === 1 ? 12 : month - 1;
    const targetYear = month === 1 ? year - 1 : year;
    goToMonth(targetYear, targetMonth);
  }

  function goToNextMonth() {
    const targetMonth = month === 12 ? 1 : month + 1;
    const targetYear = month === 12 ? year + 1 : year;
    goToMonth(targetYear, targetMonth);
  }

  function goToToday() {
    const { year: y, month: m } = keyToYearMonth(todayKey);
    navigate({ year: y, month: m, day: todayKey });
  }

  function selectDay(dateKey: string) {
    navigate({ year, month, day: dateKey });
  }

  function pickMonth(targetMonth: number) {
    setPickerOpen(false);
    goToMonth(pickerYear, targetMonth);
  }

  function handleCellKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, dateKey: string) {
    let delta = 0;
    if (e.key === "ArrowLeft") delta = -1;
    else if (e.key === "ArrowRight") delta = 1;
    else if (e.key === "ArrowUp") delta = -7;
    else if (e.key === "ArrowDown") delta = 7;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectDay(dateKey);
      return;
    } else {
      return;
    }

    e.preventDefault();
    const targetKey = shiftDateKey(dateKey, delta);
    const { year: targetYear, month: targetMonth } = keyToYearMonth(targetKey);

    if (targetYear === year && targetMonth === month) {
      // Continua no mesmo mes - so move o foco local, sem navegar (instantaneo,
      // sem round-trip ao servidor).
      setFocusedKey(targetKey);
      requestAnimationFrame(() => {
        gridRef.current?.querySelector<HTMLButtonElement>(`[data-date-key="${targetKey}"]`)?.focus();
      });
    } else {
      // Cruzou a virada do mes - precisa carregar a grade do mes vizinho.
      navigate({ year: targetYear, month: targetMonth, day: targetKey });
    }
  }

  return (
    <div className="relative rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goToPreviousMonth}
          aria-label="Mês anterior"
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())}
          aria-expanded={pickerOpen}
          className="rounded-lg px-3 py-1.5 text-lg font-semibold text-gray-900 transition hover:bg-gray-100 dark:text-neutral-100 dark:hover:bg-neutral-800"
        >
          {monthLabel}
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToToday}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={goToNextMonth}
            aria-label="Próximo mês"
            className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {pickerOpen && (
        <MonthYearPicker
          pickerYear={pickerYear}
          currentMonth={month}
          currentYear={year}
          onChangeYear={setPickerYear}
          onPickMonth={pickMonth}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-neutral-500">
        {WEEKDAY_HEADERS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>

      <div ref={gridRef} role="grid" aria-label={monthLabel} className="mt-1 flex flex-col gap-1">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} role="row" className="grid grid-cols-7 gap-1">
            {week.map((cell, cellIndex) => {
              if (!cell) {
                return <div key={cellIndex} role="gridcell" aria-hidden="true" />;
              }

              const isToday = cell.dateKey === todayKey;
              const isSelected = cell.dateKey === selectedKey;
              const isFocusable = cell.dateKey === focusedKey;
              const label = `${cell.fullDateLabel}, ${
                cell.appointmentCount === 0
                  ? "sem compromissos"
                  : cell.appointmentCount === 1
                    ? "1 compromisso"
                    : `${cell.appointmentCount} compromissos`
              }`;

              return (
                <div key={cellIndex} role="gridcell">
                  <button
                    type="button"
                    data-date-key={cell.dateKey}
                    tabIndex={isFocusable ? 0 : -1}
                    onClick={() => selectDay(cell.dateKey)}
                    onKeyDown={(e) => handleCellKeyDown(e, cell.dateKey)}
                    onFocus={() => setFocusedKey(cell.dateKey)}
                    aria-label={label}
                    aria-current={isToday ? "date" : undefined}
                    aria-pressed={isSelected}
                    className={`relative flex aspect-square w-full min-h-10 flex-col items-center justify-center rounded-full text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ${
                      isSelected
                        ? "bg-gray-900 font-semibold text-white dark:bg-neutral-100 dark:text-neutral-900"
                        : isToday
                          ? "font-semibold text-gray-900 ring-1 ring-inset ring-gray-400 dark:text-neutral-100 dark:ring-neutral-600"
                          : "text-gray-700 hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <span>{cell.dayNumber}</span>
                    {cell.hasAppointment && (
                      <span
                        aria-hidden="true"
                        className={`absolute bottom-1.5 h-1 w-1 rounded-full ${
                          isSelected ? "bg-white dark:bg-neutral-900" : "bg-gray-400 dark:bg-neutral-500"
                        }`}
                      />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthYearPicker({
  pickerYear,
  currentMonth,
  currentYear,
  onChangeYear,
  onPickMonth,
  onClose,
}: {
  pickerYear: number;
  currentMonth: number;
  currentYear: number;
  onChangeYear: (year: number) => void;
  onPickMonth: (month: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="absolute inset-x-4 top-20 z-10 rounded-xl border border-gray-200 bg-white p-4 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 sm:inset-x-6">
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => onChangeYear(pickerYear - 1)}
          aria-label="Ano anterior"
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{pickerYear}</span>
        <button
          type="button"
          onClick={() => onChangeYear(pickerYear + 1)}
          aria-label="Próximo ano"
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {MONTH_ABBREVIATIONS.map((label, index) => {
          const monthNumber = index + 1;
          const isCurrent = pickerYear === currentYear && monthNumber === currentMonth;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onPickMonth(monthNumber)}
              aria-current={isCurrent ? "date" : undefined}
              className={`rounded-lg px-2 py-2 text-sm font-medium transition ${
                isCurrent
                  ? "bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "text-gray-700 hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
