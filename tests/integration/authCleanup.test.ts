import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { INACTIVITY_TIMEOUT_MINUTES } from "@/lib/auth/sessionPolicy";
import { CLEANUP_BATCH_SIZE, CLEANUP_GRACE_MS, cleanupExpiredAuthData, cleanupExpiredAuthDataSafely } from "@/lib/auth/cleanup";
import { POST as postLogin } from "@/app/api/auth/login/route";
import { POST as postForgot } from "@/app/api/auth/forgot-password/route";

// Limpeza oportunista de sessoes e links de recuperacao vencidos (src/lib/auth/cleanup.ts):
// apaga so o que venceu/foi usado ha mais de 24 h, em lote, de todos os usuarios; nunca uma
// sessao valida nem um link ainda valido e nao usado; e a falha da limpeza nunca derruba o login
// (ela roda em after(), depois da resposta).
// O login real chama createUserSession (next/headers), simulado como nas demais integracoes de rota.
vi.mock("@/lib/auth/cookies", () => ({ createUserSession: async () => new Date() }));

// after() do Next.js so existe dentro de uma requisicao real (fora dela lanca). Aqui as rotas sao
// chamadas direto, entao o after() e simulado: guarda a tarefa agendada e o teste a executa
// DEPOIS de a rota responder (runAfterTasks) - exatamente a ordem que o Next.js garante.
const afterQueue = vi.hoisted(() => ({ tasks: [] as Array<() => unknown> }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    afterQueue.tasks.push(task);
  },
}));
async function runAfterTasks(): Promise<void> {
  const tasks = afterQueue.tasks.splice(0);
  await Promise.all(tasks.map((task) => task()));
}

const H = 60 * 60 * 1000;
const MIN = 60 * 1000;
const createdUserIds: string[] = [];

async function newUser(password = "SenhaValida123") {
  const user = await prisma.user.create({
    data: { name: "Teste Limpeza", email: `limpeza-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: await hashPassword(password) },
  });
  createdUserIds.push(user.id);
  return user;
}

const id = () => crypto.randomUUID();
const ago = (ms: number) => new Date(Date.now() - ms);
const ahead = (ms: number) => new Date(Date.now() + ms);

async function addSession(userId: string, expiresAt: Date, lastActivityAt: Date) {
  const row = await prisma.session.create({ data: { id: id(), userId, expiresAt, lastActivityAt } });
  return row.id;
}
async function addToken(userId: string, expiresAt: Date, usedAt: Date | null = null) {
  const row = await prisma.passwordResetToken.create({ data: { userId, tokenHash: id(), expiresAt, usedAt } });
  return row.id;
}
async function sessionsLeft(ids: string[]) {
  return new Set((await prisma.session.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((s) => s.id));
}
async function tokensLeft(ids: string[]) {
  return new Set((await prisma.passwordResetToken.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((s) => s.id));
}

// O banco de teste e compartilhado e pode ter lixo antigo de outras execucoes: esvazia o que ja
// e apagavel (em lotes) para os testes de contagem partirem de um estado conhecido.
async function drain() {
  for (let i = 0; i < 500; i++) {
    const r = await cleanupExpiredAuthData();
    if (r.sessions === 0 && r.resetTokens === 0) return;
  }
  throw new Error("limpeza nao esvaziou o lixo antigo");
}

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.passwordResetToken.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("cleanupExpiredAuthData: o que apaga e o que mantém", () => {
  it("sessões: apaga as expiradas há mais de 24 h (teto absoluto ou inatividade); mantém válidas e as vencidas há menos de 24 h", async () => {
    const user = await newUser();
    const inactivityCutoff = CLEANUP_GRACE_MS + INACTIVITY_TIMEOUT_MINUTES * MIN; // 24 h + 60 min sem uso

    const toDelete = [
      await addSession(user.id, ago(25 * H), new Date()), // teto absoluto vencido ha 25 h
      await addSession(user.id, ahead(20 * 24 * H), ago(inactivityCutoff + 2 * MIN)), // inativa: expirou ha 24 h e 2 min
      await addSession(user.id, ago(30 * 24 * H), ago(31 * 24 * H)), // muito antiga, nos dois criterios
    ];
    const toKeep = [
      await addSession(user.id, ahead(7 * 24 * H), new Date()), // valida
      await addSession(user.id, ahead(1 * H), ago(10 * MIN)), // valida, em uso, perto do fim
      await addSession(user.id, ahead(7 * 24 * H), ago(INACTIVITY_TIMEOUT_MINUTES * MIN - MIN)), // quase inativa, ainda valida
      await addSession(user.id, ago(1 * H), new Date()), // teto vencido ha 1 h (folga de 24 h)
      await addSession(user.id, ahead(20 * 24 * H), ago(2 * H)), // expirada por inatividade ha 1 h (folga)
      await addSession(user.id, ahead(20 * 24 * H), ago(inactivityCutoff - 2 * MIN)), // expirou por inatividade ha 23 h 58 min (folga)
    ];

    await drain();
    expect(await sessionsLeft(toDelete)).toEqual(new Set());
    expect(await sessionsLeft(toKeep)).toEqual(new Set(toKeep));
  });

  it("links: apaga os vencidos ou usados há mais de 24 h; mantém o válido não usado e os recentes", async () => {
    const user = await newUser();
    const toDelete = [
      await addToken(user.id, ago(25 * H)), // vencido ha 25 h, nunca usado
      await addToken(user.id, ago(26 * H), ago(26 * H + 10 * MIN)), // usado e vencido ha mais de 24 h
      await addToken(user.id, ahead(30 * MIN), ago(25 * H)), // usado ha 25 h (criterio "usado" isolado)
    ];
    const toKeep = [
      await addToken(user.id, ahead(30 * MIN)), // ainda valido e nao usado
      await addToken(user.id, ahead(1 * MIN)), // valido, quase vencendo
      await addToken(user.id, ago(1 * H)), // vencido ha 1 h (folga)
      await addToken(user.id, ahead(30 * MIN), ago(1 * H)), // usado ha 1 h (folga)
      await addToken(user.id, ago(23 * H), ago(23 * H + 10 * MIN)), // usado e vencido ha 23 h (folga)
    ];

    await drain();
    expect(await tokensLeft(toDelete)).toEqual(new Set());
    expect(await tokensLeft(toKeep)).toEqual(new Set(toKeep));
  });

  it("nunca apaga uma sessão válida nem um link válido, mesmo com muito lixo ao redor (várias rodadas)", async () => {
    const user = await newUser();
    const validSessions = [await addSession(user.id, ahead(7 * 24 * H), new Date()), await addSession(user.id, ahead(30 * 24 * H), ago(30 * MIN))];
    const validTokens = [await addToken(user.id, ahead(40 * MIN)), await addToken(user.id, ahead(5 * MIN))];
    for (let i = 0; i < 20; i++) {
      await addSession(user.id, ago((30 + i) * H), ago((31 + i) * H));
      await addToken(user.id, ago((30 + i) * H));
    }
    for (let i = 0; i < 3; i++) await cleanupExpiredAuthData();
    expect(await sessionsLeft(validSessions)).toEqual(new Set(validSessions));
    expect(await tokensLeft(validTokens)).toEqual(new Set(validTokens));
  });

  it("apaga os dados de TODOS os usuários (não só de quem fez o login)", async () => {
    const [a, b] = [await newUser(), await newUser()];
    const old = [await addSession(a.id, ago(48 * H), ago(48 * H)), await addSession(b.id, ago(48 * H), ago(48 * H))];
    const oldTokens = [await addToken(a.id, ago(48 * H)), await addToken(b.id, ago(48 * H))];
    await drain();
    expect(await sessionsLeft(old)).toEqual(new Set());
    expect(await tokensLeft(oldTokens)).toEqual(new Set());
  });
});

describe("cleanupExpiredAuthData: lote", () => {
  it("o limite padrão do lote é 500", () => {
    expect(CLEANUP_BATCH_SIZE).toBe(500);
  });

  it("apaga no máximo o tamanho do lote por tabela a cada disparo e o resto sai nos seguintes", async () => {
    const user = await newUser();
    await drain(); // parte do zero: so as 7 sessoes e os 7 links abaixo sao apagaveis
    const sessions = await Promise.all(Array.from({ length: 7 }, () => addSession(user.id, ago(48 * H), ago(48 * H))));
    const tokens = await Promise.all(Array.from({ length: 7 }, () => addToken(user.id, ago(48 * H))));

    expect(await cleanupExpiredAuthData(new Date(), 3)).toEqual({ sessions: 3, resetTokens: 3 });
    expect((await sessionsLeft(sessions)).size).toBe(4);
    expect((await tokensLeft(tokens)).size).toBe(4);

    expect(await cleanupExpiredAuthData(new Date(), 3)).toEqual({ sessions: 3, resetTokens: 3 });
    expect(await cleanupExpiredAuthData(new Date(), 3)).toEqual({ sessions: 1, resetTokens: 1 });
    expect(await cleanupExpiredAuthData(new Date(), 3)).toEqual({ sessions: 0, resetTokens: 0 });
    expect((await sessionsLeft(sessions)).size).toBe(0);
    expect((await tokensLeft(tokens)).size).toBe(0);
  });
});

describe("cleanupExpiredAuthDataSafely", () => {
  it("nunca lança: a falha vira log e devolve null", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.session, "findMany").mockRejectedValueOnce(new Error("banco fora do ar"));
    await expect(cleanupExpiredAuthDataSafely()).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("[auth-cleanup]"), expect.any(Error));
  });
});

describe("rotas: a limpeza roda em after(), sem atrasar nem derrubar o login e a criação do link", () => {
  const loginRequest = (email: string, password: string) =>
    new Request("http://test/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const forgotRequest = (email: string) =>
    new Request("http://test/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });

  afterEach(() => {
    afterQueue.tasks.length = 0;
  });

  it("login com sucesso AGENDA a limpeza com after(): nada roda durante a resposta; ao rodar a tarefa, o vencido some e o válido fica", async () => {
    const user = await newUser();
    await drain();
    const old = await addSession(user.id, ago(48 * H), ago(48 * H));
    const valid = await addSession(user.id, ahead(7 * 24 * H), new Date());
    const spy = vi.spyOn(prisma.session, "findMany");

    const res = await postLogin(loginRequest(user.email, "SenhaValida123"));
    expect(res.status).toBe(200);

    // A resposta ja saiu e a limpeza ainda NAO executou: o login nao a esperou.
    expect(afterQueue.tasks).toHaveLength(1);
    expect(spy).not.toHaveBeenCalled();
    expect(await sessionsLeft([old])).toEqual(new Set([old]));

    await runAfterTasks(); // "depois da resposta": o Next.js executa a tarefa agendada

    expect(spy).toHaveBeenCalled();
    expect(await sessionsLeft([old, valid])).toEqual(new Set([valid]));
  });

  it("login com senha errada NÃO agenda a limpeza", async () => {
    const user = await newUser();
    const res = await postLogin(loginRequest(user.email, "senha-errada-123"));
    expect(res.status).toBe(401);
    expect(afterQueue.tasks).toHaveLength(0);
  });

  it("falha na limpeza: o login já respondeu 200 e a tarefa só gera log (não lança)", async () => {
    const user = await newUser();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.session, "findMany").mockRejectedValue(new Error("banco fora do ar"));

    const res = await postLogin(loginRequest(user.email, "SenhaValida123"));
    expect(res.status).toBe(200);
    expect((await res.json()).user.email).toBe(user.email);
    expect(afterQueue.tasks).toHaveLength(1);
    expect(error).not.toHaveBeenCalled(); // ainda nao rodou

    await expect(runAfterTasks()).resolves.toBeUndefined(); // a tarefa nao lanca
    expect(error).toHaveBeenCalledWith(expect.stringContaining("[auth-cleanup]"), expect.any(Error));
  });

  it("limpeza que nunca termina não atrasa o login (a resposta não a espera)", async () => {
    const user = await newUser();
    vi.spyOn(prisma.session, "findMany").mockImplementation(() => new Promise(() => {}) as never);
    const started = Date.now();
    const res = await postLogin(loginRequest(user.email, "SenhaValida123"));
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(afterQueue.tasks).toHaveLength(1); // agendada, nunca executada aqui
  });

  it("criar o link de recuperação agenda a limpeza; se ela falhar, a resposta já foi a mesma", async () => {
    const user = await newUser();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.session, "findMany").mockRejectedValue(new Error("banco fora do ar"));

    const res = await postForgot(forgotRequest(user.email));
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe("Se este e-mail existir, você receberá um link.");
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1); // o link foi criado
    expect(afterQueue.tasks).toHaveLength(1);
    expect(error).not.toHaveBeenCalled();

    await expect(runAfterTasks()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("[auth-cleanup]"), expect.any(Error));
  });

  it("criar o link de recuperação: ao rodar a tarefa agendada, o link vencido some e o novo (válido) fica", async () => {
    const user = await newUser();
    await drain();
    const oldToken = await addToken(user.id, ago(48 * H));
    const res = await postForgot(forgotRequest(user.email));
    expect(res.status).toBe(200);
    expect(await tokensLeft([oldToken])).toEqual(new Set([oldToken])); // a resposta nao esperou
    await runAfterTasks();
    expect(await tokensLeft([oldToken])).toEqual(new Set());
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } } })).toBe(1);
  });

  it("e-mail que não existe: nenhum link é criado e nada é agendado", async () => {
    const res = await postForgot(forgotRequest(`nao-existe-${Date.now()}@example.com`));
    expect(res.status).toBe(200);
    expect(afterQueue.tasks).toHaveLength(0);
  });
});
