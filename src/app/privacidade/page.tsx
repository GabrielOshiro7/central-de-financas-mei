import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { PRIVACY_POLICY } from "@/content/legal";

export const metadata: Metadata = { title: PRIVACY_POLICY.title };

// Publica (sem login): /privacidade nao esta no matcher do proxy.ts.
export default function Page() {
  return <LegalDocumentView doc={PRIVACY_POLICY} />;
}
