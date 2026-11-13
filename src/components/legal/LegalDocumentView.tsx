import Link from "next/link";
import { LEGAL_DOCS_DRAFT, SERVICE_NAME } from "@/content/legal/meta";
import { STORAGE_INVENTORY } from "@/content/legal/cookieInventory";
import type { LegalBlock, LegalDocument } from "@/content/legal/types";
import { LegalLinks } from "@/components/legal/LegalLinks";

const tableClass = "w-full border-collapse text-left text-sm";
const thClass = "border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300";
const tdClass = "border border-gray-200 px-3 py-2 align-top text-gray-700 dark:border-neutral-800 dark:text-neutral-300";

function Block({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case "p":
      return <p className="text-sm leading-relaxed text-gray-700 dark:text-neutral-300">{block.text}</p>;
    case "ul":
      return (
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-gray-700 dark:text-neutral-300">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "note":
      return (
        <p className="border-l-2 border-ember bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-700 dark:bg-neutral-800 dark:text-neutral-300">
          {block.text}
        </p>
      );
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                {block.head.map((cell) => (
                  <th key={cell} scope="col" className={thClass}>
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row.join("|")}>
                  {row.map((cell, index) => (
                    <td key={index} className={tdClass}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "cookie-table":
      return (
        <div className="overflow-x-auto">
          <table className={tableClass} data-testid="cookie-table">
            <thead>
              <tr>
                {["Nome", "Tipo", "Finalidade", "Duração", "Detalhes técnicos"].map((cell) => (
                  <th key={cell} scope="col" className={thClass}>
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STORAGE_INVENTORY.map((item) => (
                <tr key={item.name}>
                  <td className={`${tdClass} font-mono text-xs`}>{item.name}</td>
                  <td className={tdClass}>
                    {item.kind === "cookie" ? "Cookie" : "Armazenamento local"} · {item.category}
                  </td>
                  <td className={tdClass}>{item.purpose}</td>
                  <td className={tdClass}>{item.duration}</td>
                  <td className={tdClass}>{item.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

// Pagina de um documento legal (publica, sem login). Enquanto LEGAL_DOCS_DRAFT for true,
// mostra a faixa "Rascunho - em revisao" no topo.
export function LegalDocumentView({ doc }: { doc: LegalDocument }) {
  return (
    <div className="min-h-screen bg-page">
      {LEGAL_DOCS_DRAFT && (
        <div
          role="note"
          data-testid="legal-draft-banner"
          className="border-b border-gray-300 bg-gray-100 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        >
          Rascunho — em revisão
        </div>
      )}
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link href="/" className="text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400">
          ← {SERVICE_NAME}
        </Link>
        <article className="mt-6 border border-gray-200 bg-white p-6 sm:p-8 dark:border-neutral-800 dark:bg-neutral-900">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">{doc.title}</h1>
          <p className="mt-2 text-xs text-gray-500 dark:text-neutral-400" data-testid="legal-version">
            Versão {doc.version} · Vigência: {doc.effectiveDate}
          </p>
          {doc.intro && <p className="mt-4 text-sm leading-relaxed text-gray-700 dark:text-neutral-300">{doc.intro}</p>}

          <div className="mt-8 flex flex-col gap-8">
            {doc.sections.map((section) => (
              <section key={section.id} aria-labelledby={`sec-${section.id}`} className="flex flex-col gap-3">
                <h2 id={`sec-${section.id}`} className="text-base font-semibold text-gray-900 dark:text-neutral-100">
                  {section.title}
                </h2>
                {section.blocks.map((block, index) => (
                  <Block key={index} block={block} />
                ))}
              </section>
            ))}
          </div>
        </article>
        <LegalLinks className="mt-6 text-gray-500 dark:text-neutral-400" />
      </div>
    </div>
  );
}
