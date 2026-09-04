# Nome do Sistema — Etapa 1: Autenticação

Base de autenticação (login, cadastro, logout, recuperação de senha) do sistema de
gestão empresarial. Ver [docs-etapa1-prompt.md](./docs-etapa1-prompt.md) para o
escopo completo desta etapa.

## Stack

- Next.js 16 (App Router) + TypeScript
- PostgreSQL (via Docker Compose para desenvolvimento local)
- Prisma 7 (driver adapter `@prisma/adapter-pg`)
- Sessão própria em cookie httpOnly (não usa Auth.js/NextAuth)
- bcryptjs para hash de senha
- Zod para validação (compartilhada entre frontend e backend)
- Tailwind CSS
- Vitest (testes unitários/integração) + Playwright (E2E)

## Rodando localmente

Pré-requisitos: Node.js 20+, Docker Desktop.

```bash
# 1. instalar dependencias
npm install

# 2. copiar variaveis de ambiente
cp .env.example .env
# os valores padrao ja funcionam com o docker-compose abaixo

# 3. subir o Postgres local
docker compose up -d

# 4. aplicar as migrations
npx prisma migrate dev

# 5. rodar o servidor de desenvolvimento
npm run dev
```

Acesse http://localhost:3000.

## Variáveis de ambiente

Ver [.env.example](./.env.example). Nenhum segredo real é necessário nesta etapa —
o `DATABASE_URL` padrão aponta para o Postgres do `docker-compose.yml`, e o envio
de e-mail de recuperação de senha usa uma implementação de desenvolvimento que
apenas loga o link no console do servidor (`src/lib/email/devEmailService.ts`).

## Testes

```bash
# unitarios + integracao (precisa do Postgres rodando: docker compose up -d)
npm run test

# end-to-end (sobe o proprio dev server automaticamente)
npm run test:e2e
```

## Estrutura

```
prisma/schema.prisma          modelos User, Session, PasswordResetToken
prisma.config.ts              config do Prisma 7 (conexao usada por migrate/generate)
src/app/                      paginas (login, register, forgot-password, reset-password, dashboard)
src/app/api/auth/             route handlers (register, login, logout, forgot-password, reset-password)
src/lib/auth/                 hashing, sessao/cookies, rate limiting, token de reset
src/lib/email/                interface EmailService + implementacao de dev
src/lib/validation/           schemas Zod compartilhados
src/proxy.ts                  protege /dashboard (checagem otimista de cookie)
tests/unit/, tests/integration/  Vitest
tests/e2e/                    Playwright
```
