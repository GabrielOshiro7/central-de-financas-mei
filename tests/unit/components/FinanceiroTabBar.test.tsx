// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { FINANCEIRO_TABS, FinanceiroTabBar, SCROLLED_THRESHOLD_PX } from "@/components/financeiro/FinanceiroTabBar";

const navigation = vi.hoisted(() => ({ pathname: "/financeiro/receitas" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

// jsdom não faz layout nem rola de verdade: `window.scrollY` é só um número
// que o teste define antes de disparar o evento "scroll". Isso cobre a lógica
// (limiar + troca do data-scrolled), não o efeito visual - sticky, transição
// do fundo e o fade das bordas dependem de CSS/layout reais e ficam pro teste
// manual no navegador.
function scrollPageTo(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  fireEvent.scroll(window);
}

function getBar() {
  return screen.getByRole("navigation", { name: "Seções do Financeiro" }).parentElement!;
}

afterEach(() => {
  cleanup();
  navigation.pathname = "/financeiro/receitas";
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
});

describe("FinanceiroTabBar - aba ativa", () => {
  it("renderiza todas as abas com o href certo", () => {
    render(<FinanceiroTabBar />);
    for (const tab of FINANCEIRO_TABS) {
      expect(screen.getByRole("link", { name: tab.label })).toHaveAttribute("href", tab.href);
    }
  });

  it.each(FINANCEIRO_TABS.map((tab) => [tab.href, tab.label]))(
    "em %s só a aba %s fica marcada como ativa",
    (href, label) => {
      navigation.pathname = href;
      render(<FinanceiroTabBar />);

      const active = screen.getByRole("link", { name: label });
      expect(active).toHaveAttribute("aria-current", "page");
      expect(active).toHaveClass("border-ember", "font-semibold");

      const others = screen.getAllByRole("link").filter((link) => link !== active);
      expect(others).toHaveLength(FINANCEIRO_TABS.length - 1);
      for (const link of others) {
        expect(link).not.toHaveAttribute("aria-current");
        expect(link).toHaveClass("border-transparent");
        expect(link).not.toHaveClass("border-ember");
      }
    }
  );

  it("a raiz /financeiro nao e mais uma aba (vira redirect em next.config.ts)", () => {
    expect(FINANCEIRO_TABS.map((t) => t.href)).not.toContain("/financeiro");
    navigation.pathname = "/financeiro";
    render(<FinanceiroTabBar />);
    for (const link of screen.getAllByRole("link")) {
      expect(link).not.toHaveAttribute("aria-current");
    }
  });

  it("fora das rotas das abas (ex.: subrota desconhecida) nenhuma fica ativa", () => {
    navigation.pathname = "/financeiro/receitas/123";
    render(<FinanceiroTabBar />);
    for (const link of screen.getAllByRole("link")) {
      expect(link).not.toHaveAttribute("aria-current");
    }
  });

  it("renderiza a ação passada (botão de novo lançamento) dentro da barra", () => {
    render(<FinanceiroTabBar action={<button type="button">+ Novo lançamento</button>} />);
    expect(getBar()).toContainElement(screen.getByRole("button", { name: "+ Novo lançamento" }));
  });
});

describe("FinanceiroTabBar - estado 'rolado'", () => {
  it("nasce sem o estado rolado (integrada ao fundo)", () => {
    render(<FinanceiroTabBar />);
    expect(getBar()).toHaveAttribute("data-scrolled", "false");
  });

  it("ganha o estado rolado depois do limiar e perde ao voltar ao topo", async () => {
    render(<FinanceiroTabBar />);
    const bar = getBar();

    scrollPageTo(SCROLLED_THRESHOLD_PX);
    await waitFor(() => expect(bar).toHaveAttribute("data-scrolled", "false"));

    scrollPageTo(SCROLLED_THRESHOLD_PX + 1);
    await waitFor(() => expect(bar).toHaveAttribute("data-scrolled", "true"));

    scrollPageTo(0);
    await waitFor(() => expect(bar).toHaveAttribute("data-scrolled", "false"));
  });

  it("já nasce rolada se a página estiver rolada ao montar", () => {
    Object.defineProperty(window, "scrollY", { value: 400, configurable: true });
    render(<FinanceiroTabBar />);
    expect(getBar()).toHaveAttribute("data-scrolled", "true");
  });

  it("remove o listener de scroll ao desmontar", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<FinanceiroTabBar />);
    unmount();
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
    remove.mockRestore();
  });
});
