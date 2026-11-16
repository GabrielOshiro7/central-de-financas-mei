import { z } from "zod";

// Use SEMPRE `import { z } from "@/lib/zod"` (nao de "zod"): o ESLint impede o import direto.
//
// Zod 4 tenta compilar os schemas de objeto com `new Function` (JIT) e, antes, TESTA se isso e
// permitido (`Function("")` dentro de um try/catch). Com a CSP do site isso gerava UMA violacao
// de 'unsafe-eval' em toda pagina carregada (achada pelo navegador em producao; em
// desenvolvimento nao aparece porque a CSP de dev libera 'unsafe-eval' para o React). A CSP
// nao quebraria nada (o Zod cai no caminho sem JIT), mas poluiria o relatorio de violacoes.
//
// No navegador o JIT nao faz falta (validam-se so formularios pequenos), entao ele e desligado
// la. No servidor continua ligado: a CSP nao se aplica ao codigo do servidor.
if (typeof window !== "undefined") z.config({ jitless: true });

export { z };
