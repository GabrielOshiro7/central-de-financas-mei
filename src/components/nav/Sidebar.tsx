"use client";

import { useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  Bot,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
} from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { ThemeToggle } from "@/components/ThemeToggle";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

/**
 * Pequeno "external store" em torno do localStorage, no molde do
 * `useSyncExternalStore` (mesma ideia do `useHasMounted` em ThemeToggle,
 * aplicada a um valor em vez de só "já montou?"). Evita tanto o mismatch de
 * hidratação (getServerSnapshot sempre `false`) quanto o anti-padrão de
 * `setState` dentro de `useEffect` (o eslint-plugin-react-hooks do projeto
 * já pega isso) - React relê o snapshot depois de montar e re-renderiza se
 * for diferente, sem precisar de um efeito manual.
 */
const collapsedListeners = new Set<() => void>();

function getCollapsedSnapshot() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function getCollapsedServerSnapshot() {
  return false;
}

function subscribeCollapsed(listener: () => void) {
  collapsedListeners.add(listener);
  return () => collapsedListeners.delete(listener);
}

function setCollapsedStorage(next: boolean) {
  document.documentElement.setAttribute("data-sidebar-collapsed", String(next));
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
  } catch {
    // ignora - preferência só não persiste, sidebar continua funcional.
  }
  collapsedListeners.forEach((listener) => listener());
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/financeiro", label: "Financeiro", Icon: Wallet },
  { href: "/clientes", label: "Clientes", Icon: Users },
  { href: "/agenda", label: "Agenda", Icon: CalendarDays },
  { href: "/vendas", label: "Vendas", Icon: ShoppingCart },
  { href: "/insights", label: "Insights", Icon: Lightbulb },
  { href: "/caixa", label: "Caixa", Icon: Banknote },
  { href: "/assistente", label: "Assistente", Icon: Bot },
  { href: "/configuracoes", label: "Configurações", Icon: Settings },
] as const;

/**
 * A largura real (expandida/recolhida/mobile) é resolvida via CSS puro a
 * partir do atributo `data-sidebar-collapsed` na <html> (ver globals.css) —
 * setado antes da hidratação por um script inline em (app)/layout.tsx, pra
 * não haver flash de largura errada no load. Este estado React não controla
 * nada visualmente por si só; existe só para refletir o valor correto no
 * ícone do botão de recolher/expandir (aria-expanded, Chevron) depois que o
 * componente monta.
 */
export function Sidebar({ businessName }: { businessName: string }) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    getCollapsedSnapshot,
    getCollapsedServerSnapshot
  );

  const toggleCollapsed = useCallback(() => {
    setCollapsedStorage(!getCollapsedSnapshot());
  }, []);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-(--sidebar-w) flex-col border-r border-gray-200 bg-white transition-[width,background-color,border-color,color] duration-250 ease-in-out dark:border-neutral-800 dark:bg-neutral-900">
      <div className="sidebar-header flex h-16 shrink-0 items-center gap-2.5 border-b border-gray-200 px-4 dark:border-neutral-800">
        <Link
          href="/dashboard"
          title="OrganizAI"
          className="flex items-center gap-2.5 text-gray-900 dark:text-neutral-100"
        >
          <LogoMark className="h-8 w-8" />
          <span className="sidebar-label truncate text-lg font-bold tracking-tight whitespace-nowrap">
            OrganizAI
          </span>
        </Link>
      </div>

      <div className="sidebar-label truncate border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-600 dark:border-neutral-800 dark:text-neutral-400">
        {businessName}
      </div>

      {/* Sem overflow-y-auto de propósito: a tooltip do item recolhido
          (.sidebar-tooltip) se posiciona fora da largura da nav via
          `left-full`, e CSS força overflow-x a virar "auto" (recortando a
          tooltip) sempre que overflow-y não é "visible" - ver
          https://www.w3.org/TR/css-overflow-3/#overflow-properties. Com só
          8 itens a lista cabe em qualquer viewport razoável; se a lista
          crescer a ponto de precisar rolar, mover a tooltip pra fora da
          nav (ex.: portal) em vez de reintroduzir overflow-y aqui. */}
      <nav className="flex-1 py-2">
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href} className="sidebar-item relative px-2">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  title={label}
                  className={`sidebar-nav-link flex items-center gap-3 border-l-2 px-2.5 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "border-gray-900 bg-gray-100 text-gray-900 dark:border-neutral-100 dark:bg-neutral-800 dark:text-neutral-100"
                      : "border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-100"
                  }`}
                >
                  <Icon size={20} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
                  <span className="sidebar-label truncate whitespace-nowrap">{label}</span>
                </Link>
                <span
                  role="tooltip"
                  className="sidebar-tooltip pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium whitespace-nowrap text-white shadow-md dark:bg-neutral-100 dark:text-neutral-900"
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="sidebar-footer relative shrink-0 border-t border-gray-200 p-2 dark:border-neutral-800">
        <ThemeToggle />
        <LogoutButton
          icon={<LogOut size={20} strokeWidth={1.75} aria-hidden="true" />}
          labelClassName="sidebar-label"
          className="px-2 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-60 dark:text-neutral-400 dark:hover:bg-neutral-800"
        />
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className="hidden shrink-0 items-center justify-center border border-gray-300 p-1.5 text-gray-600 transition-colors hover:bg-gray-100 md:inline-flex dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {collapsed ? (
            <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>
      </div>
    </aside>
  );
}
