import { COOKIES_NOTICE } from "@/content/legal/cookies";
import { PRIVACY_POLICY } from "@/content/legal/privacy";
import { TERMS_OF_SERVICE } from "@/content/legal/terms";
import type { LegalDocument } from "@/content/legal/types";

export { COOKIES_NOTICE, PRIVACY_POLICY, TERMS_OF_SERVICE };
export const LEGAL_DOCUMENTS: LegalDocument[] = [PRIVACY_POLICY, TERMS_OF_SERVICE, COOKIES_NOTICE];
