import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { PUT as putTheme } from "@/app/api/account/theme/route";
import { POST as postLogin } from "@/app/api/auth/login/route";

// Preferencia de tema (claro/escuro) do usuario logado: rota autenticada com Zod
// ("LIGHT" | "DARK"), sempre do usuario da sessao (isolamento), e o login devolve o
// tema salvo (cookie "theme" + corpo). Sessao simulada, como nas demais integracoes
// de rota; o login real chama createUserSession (next/headers), tambem simulado.
const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string; themePreference: null } }));
vi.mock("@/lib/auth/cookies", () => ({
  getCurrentUser: async () => session.user,
  createUserSession: async () => new Date(),
}));

const createdUserIds: string[] = [];

async function newUser(password = "SenhaValida123") {
  const user = await prisma.user.create({
    data: { name: "Teste Tema", email: `tema-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: await hashPassword(password) },
  });
  createdUserIds.push(user.id);
  return user;
}

const login = (user: { id: string; name: string; email: string }) => {
  session.user = { id: user.id, name: user.name, email: user.email, themePreference: null };
};
const logout = () => {
  session.user = null;
};

const put = (body: unknown) =>
  putTheme(
    new Request("http://test/api/account/theme", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
const themeOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id }, select: { themePreference: true } })).themePreference;

afterAll(async () => {
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("PUT /api/account/theme", () => {
  it("sem sessão: 401 e nada é gravado", async () => {
    const user = await newUser();
    logout();
    const res = await put({ theme: "DARK" });
    expect(res.status).toBe(401);
    expect(await themeOf(user.id)).toBeNull();
  });

  it("usuário novo começa sem escolha (NULL = claro); DARK e depois LIGHT são gravados e o cookie acompanha", async () => {
    const user = await newUser();
    expect(await themeOf(user.id)).toBeNull();
    login(user);

    const dark = await put({ theme: "DARK" });
    expect([dark.status, await dark.json()]).toEqual([200, { theme: "DARK" }]);
    expect(dark.cookies.get("theme")?.value).toBe("dark");
    expect(await themeOf(user.id)).toBe("DARK");

    const light = await put({ theme: "LIGHT" });
    expect(light.status).toBe(200);
    expect(light.cookies.get("theme")?.value).toBe("light");
    expect(await themeOf(user.id)).toBe("LIGHT");
  });

  it.each([
    [{ theme: "dark" }],
    [{ theme: "SYSTEM" }],
    [{ theme: null }],
    [{}],
    [{ theme: "DARK", userId: "outro" }],
    ["não é json"],
  ])("valida o corpo (Zod): %j -> 400, nada muda", async (body) => {
    const user = await newUser();
    login(user);
    const res = await put(body);
    expect(res.status).toBe(400);
    expect(await themeOf(user.id)).toBeNull();
  });

  it("isolamento: grava só no usuário da sessão (um id no corpo é recusado e o outro usuário não muda)", async () => {
    const a = await newUser();
    const b = await newUser();
    login(a);
    expect((await put({ theme: "DARK" })).status).toBe(200);
    expect((await put({ theme: "DARK", userId: b.id })).status).toBe(400);
    expect(await themeOf(a.id)).toBe("DARK");
    expect(await themeOf(b.id)).toBeNull();
  });
});

describe("POST /api/auth/login devolve o tema salvo", () => {
  async function doLogin(email: string, password = "SenhaValida123") {
    return postLogin(
      new Request("http://test/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
        body: JSON.stringify({ email, password }),
      })
    );
  }

  it("com DARK salvo: corpo traz theme 'dark' e o cookie 'theme' é atualizado", async () => {
    const user = await newUser();
    await prisma.user.update({ where: { id: user.id }, data: { themePreference: "DARK" } });
    const res = await doLogin(user.email);
    expect(res.status).toBe(200);
    expect((await res.json()).theme).toBe("dark");
    expect(res.cookies.get("theme")?.value).toBe("dark");
  });

  it("com LIGHT salvo: 'light'; sem escolha salva: theme null e nenhum cookie de tema é enviado", async () => {
    const light = await newUser();
    await prisma.user.update({ where: { id: light.id }, data: { themePreference: "LIGHT" } });
    const res1 = await doLogin(light.email);
    expect([(await res1.json()).theme, res1.cookies.get("theme")?.value]).toEqual(["light", "light"]);

    const none = await newUser();
    const res2 = await doLogin(none.email);
    expect(res2.status).toBe(200);
    expect([(await res2.json()).theme, res2.cookies.get("theme")]).toEqual([null, undefined]);
  });
});
