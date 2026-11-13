// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Sidebar } from "@/components/nav/Sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

// Contador de insights nao lidos ao lado da lampada: "1".."9", "9+" acima disso, some
// com 0; rotulo acessivel no singular/plural.
afterEach(cleanup);

const renderSidebar = (unread?: number) =>
  render(
    <ThemeProvider initialTheme="light">
      <Sidebar businessName="Empresa" unreadInsights={unread} />
    </ThemeProvider>
  );

// Dois elementos no DOM (um ao lado do rotulo, outro sobre o icone da barra recolhida); o CSS
// mostra so o que cabe no estado da barra.
const badges = () => screen.queryAllByTestId("insights-unread-badge");

describe("contador de insights nao lidos na barra lateral", () => {
  it.each([
    [1, "1", "1 insight não lido"],
    [2, "2", "2 insights não lidos"],
    [9, "9", "9 insights não lidos"],
    [10, "9+", "10 insights não lidos"],
    [137, "9+", "137 insights não lidos"],
  ])("%i nao lidos => texto %s e rotulo '%s' (nos dois lugares)", (count, text, label) => {
    renderSidebar(count);
    expect(badges()).toHaveLength(2);
    for (const badge of badges()) {
      expect(badge.textContent).toBe(text);
      expect(badge.getAttribute("aria-label")).toBe(label);
    }
    // O nome acessivel do link mantem o rotulo e diz quantos nao lidos.
    expect(screen.getByRole("link", { name: `Insights, ${label}` })).toBeTruthy();
  });

  it("0 (ou sem a prop): o contador some e o link segue chamando 'Insights'", () => {
    renderSidebar(0);
    expect(badges()).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Insights" })).toBeTruthy();
    cleanup();
    renderSidebar(undefined);
    expect(badges()).toHaveLength(0);
  });

  it("so o item Insights recebe o contador", () => {
    renderSidebar(3);
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Financeiro/ })).toBeTruthy();
    expect(badges().every((badge) => badge.closest("a")?.getAttribute("href") === "/insights")).toBe(true);
  });

  it("estilo: fundo Ember (#D9541E) e texto #111111 pelos tokens", () => {
    renderSidebar(3);
    for (const badge of badges()) {
      expect(badge.className).toContain("bg-ember");
      expect(badge.className).toContain("text-ember-ink");
    }
  });
});
