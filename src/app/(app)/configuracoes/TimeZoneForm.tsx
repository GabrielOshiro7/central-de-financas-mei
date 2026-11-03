"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Info } from "lucide-react";
import { SubmitButton } from "@/components/SubmitButton";
import { COUNTRY_ZONES, findCountry, zoneForCountry } from "@/lib/time/countryZones";
import { businessTimeZoneSchema } from "@/lib/time/schema";

const selectClass =
  "h-10 w-full border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
const labelClass = "mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300";

export type TimeZoneFormData = { country: string; timezone: string };

// País e fuso da empresa (Etapa F7). O fuso define o "hoje" da empresa -
// vencimentos, periodos, fechamento do dia e Agenda -, nunca o do navegador.
// País com um fuso: so o select de país; com varios: aparece o de fuso, com o
// fuso atual (se for do país) ou o padrao do país. Datas ja lancadas sao dias
// de calendario (@db.Date, Etapa F6) e nao mudam com a troca.
export function TimeZoneForm({ data }: { data: TimeZoneFormData }) {
  const router = useRouter();
  const initialCountry = findCountry(data.country) ? data.country : "";
  const [country, setCountry] = useState(initialCountry);
  const [timezone, setTimezone] = useState(
    initialCountry ? (zoneForCountry(initialCountry, data.timezone) ?? "") : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const zones = findCountry(country)?.zones ?? [];

  function handleCountryChange(code: string) {
    setCountry(code);
    setTimezone(zoneForCountry(code, timezone) ?? "");
    setMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const parsed = businessTimeZoneSchema.safeParse({ country, timezone });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/business/timezone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? "Não foi possível salvar.");
        return;
      }
      setMessage("País e fuso atualizados.");
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">País e fuso horário</h2>
        <p className="mt-1 flex gap-2 text-xs text-gray-500 dark:text-neutral-400">
          <Info aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            O fuso da empresa define o que é &quot;hoje&quot;: vencimentos, períodos dos relatórios, o fechamento do
            dia e os horários da Agenda. Datas já lançadas não mudam — um lançamento de 20/10 continua em 20/10.
          </span>
        </p>
      </div>

      <div>
        <label htmlFor="businessCountry" className={labelClass}>
          País
        </label>
        <select
          id="businessCountry"
          value={country}
          onChange={(e) => handleCountryChange(e.target.value)}
          className={selectClass}
        >
          {!initialCountry && <option value="">Selecione...</option>}
          {COUNTRY_ZONES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {zones.length > 1 && (
        <div>
          <label htmlFor="businessTimeZone" className={labelClass}>
            Fuso horário
          </label>
          <select
            id="businessTimeZone"
            value={timezone}
            onChange={(e) => {
              setTimezone(e.target.value);
              setMessage(null);
            }}
            className={selectClass}
          >
            {zones.map((z) => (
              <option key={z.timeZone} value={z.timeZone}>
                {z.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-neutral-100">
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      {message && (
        <p className="flex items-center gap-2 text-sm text-gray-700 dark:text-neutral-300">
          <Check aria-hidden="true" className="h-4 w-4 shrink-0" />
          {message}
        </p>
      )}

      <SubmitButton pending={pending} pendingText="Salvando...">
        Salvar país e fuso
      </SubmitButton>
    </form>
  );
}
