import type { Metadata } from "next";
import Link from "next/link";
import { SERVICE_NAME } from "@/content/legal/meta";
import { LegalLinks } from "@/components/legal/LegalLinks";
import licenseFile from "@/content/legal/thirdPartyLicenses.json";

export const metadata: Metadata = { title: "Avisos de terceiros" };

type LicensedPackage = { name: string; version: string; license: string; elected?: string; category: string };

// Licenca do GSAP (gsap e @gsap/react): nome e endereco oficiais.
const GSAP_LICENSE_NAME = "Standard No Charge GSAP License";
const GSAP_LICENSE_URL = "https://gsap.com/standard-license";

const CATEGORY_LABELS: Record<string, string> = {
  permissiva: "Permissiva (MIT, BSD, Apache-2.0, ISC e similares)",
  "copyleft-fraco": "Copyleft fraco (LGPL, MPL)",
  "copyleft-forte": "Copyleft forte (GPL, AGPL)",
  personalizada: "Licença própria do autor",
  desconhecida: "Sem licença declarada no pacote",
};

// Fontes de texto: servidas pelo proprio servico (empacotadas no build pelo Next.js, sem pedido a
// servidores externos), todas sob a SIL Open Font License 1.1.
const FONTS = [
  { name: "Inter", holder: "The Inter Project Authors (github.com/rsms/inter)" },
  { name: "Geist e Geist Mono", holder: "The Geist Project Authors (github.com/vercel/geist-font)" },
];

const tableClass = "w-full border-collapse text-left text-sm";
const thClass = "border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300";
const tdClass = "border border-gray-200 px-3 py-2 align-top text-gray-700 dark:border-neutral-800 dark:text-neutral-300";

// Publica (sem login): /licencas nao esta no matcher do proxy.ts. A lista vem de
// src/content/legal/thirdPartyLicenses.json, gerada do package-lock.json por scripts/licenses.mjs
// (npm run licenses:generate); um teste falha se ela ficar desatualizada.
export default function Page() {
  const packages = licenseFile.packages as LicensedPackage[];
  const counts = packages.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + 1;
    return acc;
  }, {});
  const icons = packages.find((item) => item.name === "lucide-react");
  const gsap = packages.find((item) => item.name === "gsap");
  const gsapReact = packages.find((item) => item.name === "@gsap/react");
  // Pacotes com licenca dupla ("A OR B"): o projeto registra qual usa (scripts/licenses.mjs, LICENSE_ELECTIONS).
  const elections = packages.filter((item) => item.elected);

  return (
    <div className="min-h-screen bg-page">
      {/* <main>: regiao principal (WCAG 1.3.1 / 2.4.1). */}
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link href="/" className="text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400">
          ← {SERVICE_NAME}
        </Link>
        <article className="mt-6 border border-gray-200 bg-white p-6 sm:p-8 dark:border-neutral-800 dark:bg-neutral-900">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Avisos de terceiros</h1>
          <p className="mt-4 text-sm leading-relaxed text-gray-700 dark:text-neutral-300" data-testid="licenses-intro">
            O {SERVICE_NAME} é construído com software de terceiros, muitos deles de código aberto. Esta página lista cada componente
            incluído no serviço em produção, com a versão e a licença sob a qual é usado. A lista é gerada automaticamente do arquivo
            de dependências do projeto.
          </p>

          <div className="mt-8 flex flex-col gap-8">
            <section aria-labelledby="sec-resumo" className="flex flex-col gap-3">
              <h2 id="sec-resumo" className="text-base font-semibold text-gray-900 dark:text-neutral-100">
                Resumo
              </h2>
              <div className="overflow-x-auto">
                <table className={tableClass} data-testid="licenses-summary">
                  <caption className="sr-only">Quantidade de componentes por tipo de licença</caption>
                  <thead>
                    <tr>
                      <th scope="col" className={thClass}>
                        Tipo de licença
                      </th>
                      <th scope="col" className={thClass}>
                        Componentes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(CATEGORY_LABELS).map(([category, label]) => (
                      <tr key={category}>
                        <td className={tdClass}>{label}</td>
                        <td className={tdClass}>{counts[category] ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="sec-fontes" className="flex flex-col gap-3">
              <h2 id="sec-fontes" className="text-base font-semibold text-gray-900 dark:text-neutral-100">
                Fontes e ícones
              </h2>
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-gray-700 dark:text-neutral-300">
                {FONTS.map((font) => (
                  <li key={font.name}>
                    Fonte {font.name}: © {font.holder}, licença SIL Open Font License 1.1 (openfontlicense.org). As fontes são servidas
                    pelo próprio {SERVICE_NAME}.
                  </li>
                ))}
                {icons && (
                  <li>
                    Ícones: biblioteca lucide-react {icons.version}, licença {icons.license} (consta também na lista abaixo).
                  </li>
                )}
              </ul>
            </section>

            <section aria-labelledby="sec-especiais" className="flex flex-col gap-3" data-testid="licenses-special">
              <h2 id="sec-especiais" className="text-base font-semibold text-gray-900 dark:text-neutral-100">
                Licenças que merecem destaque
              </h2>
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-gray-700 dark:text-neutral-300">
                {gsap && (
                  <li>
                    Animações: gsap {gsap.version}
                    {gsapReact ? ` e @gsap/react ${gsapReact.version}` : ""}, usados sob a licença {GSAP_LICENSE_NAME} (
                    <a href={GSAP_LICENSE_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-gray-900 underline dark:text-neutral-100">
                      {GSAP_LICENSE_URL}
                    </a>
                    ).
                  </li>
                )}
                {elections.map((item) => (
                  <li key={`${item.name}@${item.version}`}>
                    {item.name} {item.version}: oferecido sob {item.license.replace(/[()]/g, "")}, à escolha de quem usa; o {SERVICE_NAME} usa sob
                    a licença {item.elected}.
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="sec-lista" className="flex flex-col gap-3">
              <h2 id="sec-lista" className="text-base font-semibold text-gray-900 dark:text-neutral-100">
                Componentes de terceiros ({packages.length})
              </h2>
              <div className="overflow-x-auto">
                <table className={tableClass} data-testid="licenses-table">
                  <caption className="sr-only">Componentes de terceiros, versão e licença</caption>
                  <thead>
                    <tr>
                      <th scope="col" className={thClass}>
                        Pacote
                      </th>
                      <th scope="col" className={thClass}>
                        Versão
                      </th>
                      <th scope="col" className={thClass}>
                        Licença
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {packages.map((item) => (
                      <tr key={`${item.name}@${item.version}`}>
                        <td className={`${tdClass} font-mono text-xs`}>{item.name}</td>
                        <td className={`${tdClass} font-mono text-xs`}>{item.version}</td>
                        <td className={tdClass}>
                          {item.license === "UNKNOWN"
                            ? "Não declarada no pacote"
                            : item.elected
                              ? `${item.elected} (escolhida entre ${item.license.replace(/[()]/g, "")})`
                              : item.license}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </article>
        <LegalLinks className="mt-6 text-gray-500 dark:text-neutral-400" />
      </main>
    </div>
  );
}
