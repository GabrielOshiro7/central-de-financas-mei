import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { TOKUSHOHO_NOTICE } from "@/content/legal";

export const metadata: Metadata = { title: TOKUSHOHO_NOTICE.title };

// Publica (sem login): /tokushoho nao esta no matcher do proxy.ts.
export default function Page() {
  return <LegalDocumentView doc={TOKUSHOHO_NOTICE} />;
}
