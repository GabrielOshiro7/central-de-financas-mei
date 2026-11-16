import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-test/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Zod so entra por @/lib/zod (JIT desligado no navegador: evita violacao de CSP, ver src/lib/zod.ts).
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/zod.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { paths: [{ name: "zod", message: 'Importe { z } de "@/lib/zod" (JIT do Zod desligado no navegador por causa da CSP).', allowTypeImports: true }] },
      ],
    },
  },
]);

export default eslintConfig;
