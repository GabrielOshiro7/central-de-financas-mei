import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { TERMS_OF_SERVICE } from "@/content/legal";

export const metadata: Metadata = { title: TERMS_OF_SERVICE.title };

// Publica (sem login): /termos nao esta no matcher do proxy.ts.
export default function Page() {
  return <LegalDocumentView doc={TERMS_OF_SERVICE} />;
}
