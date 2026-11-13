import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { COOKIES_NOTICE } from "@/content/legal";

export const metadata: Metadata = { title: COOKIES_NOTICE.title };

// Publica (sem login): /cookies nao esta no matcher do proxy.ts.
export default function Page() {
  return <LegalDocumentView doc={COOKIES_NOTICE} />;
}
