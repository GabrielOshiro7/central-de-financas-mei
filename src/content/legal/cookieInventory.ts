import {
  ABSOLUTE_SESSION_DAYS_DEFAULT,
  ABSOLUTE_SESSION_DAYS_REMEMBERED,
  INACTIVITY_TIMEOUT_MINUTES,
} from "@/lib/auth/sessionPolicy";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE_SECONDS } from "@/lib/theme";
import { COOKIE_NOTICE_COOKIE, COOKIE_NOTICE_MAX_AGE_SECONDS } from "@/content/legal/meta";

// Inventario dos cookies e do armazenamento local do navegador, EXATAMENTE como o
// codigo os grava (src/lib/auth/cookies.ts, src/lib/theme.ts, ThemeProvider,
// Sidebar, CookieNotice). A pagina /cookies e a Politica de Privacidade leem daqui.
export type StorageKind = "cookie" | "localStorage";
export type StorageCategory = "essencial" | "preferência";

export type StorageItem = {
  name: string;
  kind: StorageKind;
  category: StorageCategory;
  purpose: string;
  duration: string;
  // Atributos tecnicos (cookies): HttpOnly / Secure / SameSite.
  details: string;
};

const days = (seconds: number) => Math.round(seconds / 86_400);

export const STORAGE_INVENTORY: StorageItem[] = [
  {
    name: "session",
    kind: "cookie",
    category: "essencial",
    purpose: "Mantém você conectado após o login. Guarda um identificador aleatório de sessão (no servidor só fica o hash dele). Só é criado depois do login ou do cadastro.",
    duration: `Sem "lembrar de mim": cookie de sessão (some ao fechar o navegador), com teto de ${ABSOLUTE_SESSION_DAYS_DEFAULT} dias no servidor. Com "lembrar de mim": até ${ABSOLUTE_SESSION_DAYS_REMEMBERED} dias. Em ambos, a sessão expira após ${INACTIVITY_TIMEOUT_MINUTES} minutos sem uso.`,
    details: "HttpOnly; Secure em produção; SameSite=Lax; caminho /",
  },
  {
    name: THEME_COOKIE,
    kind: "cookie",
    category: "preferência",
    purpose: "Lembra o tema escolhido (claro ou escuro) para que a página já abra no tema certo. Também é gravado no banco de dados quando você está conectado.",
    duration: `${days(THEME_COOKIE_MAX_AGE_SECONDS)} dias`,
    details: "Não HttpOnly (o botão de tema o grava no navegador); SameSite=Lax; caminho /",
  },
  {
    name: COOKIE_NOTICE_COOKIE,
    kind: "cookie",
    category: "essencial",
    purpose: 'Registra que você clicou em "Entendi" no aviso de cookies, para o aviso não aparecer de novo.',
    duration: `${days(COOKIE_NOTICE_MAX_AGE_SECONDS)} dias`,
    details: "Não HttpOnly; SameSite=Lax; caminho /",
  },
  {
    name: "sidebar-collapsed",
    kind: "localStorage",
    category: "preferência",
    purpose: "Lembra se a barra lateral do sistema está recolhida ou expandida.",
    duration: "Até você limpar os dados do site no navegador",
    details: 'Armazenamento local (localStorage); valor "true" ou "false"; nunca enviado ao servidor',
  },
];

export const STORAGE_NOT_USED = [
  "Cookies ou armazenamento de análise de acesso, publicidade ou rastreamento de terceiros: não são usados.",
  "sessionStorage: não é usado.",
];
