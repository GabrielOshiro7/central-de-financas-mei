# ETAPA 1 DO PROJETO — LOGIN, CADASTRO E BASE DE AUTENTICAÇÃO

> Este documento é o prompt de trabalho para esta etapa. Leia tudo antes de escrever qualquer código.
> Este é um projeto que será lançado oficialmente. Trate decisões de arquitetura e segurança com o
> mesmo rigor que teria em um sistema em produção com dados reais de clientes.

## Papel esperado

Atue como um time completo: arquiteto de software, engenheiro backend, engenheiro de segurança e QA
trabalhando juntos — não apenas como um gerador de código. Isso significa:

- Analisar antes de implementar.
- Explicar e justificar decisões técnicas relevantes (brevemente, não um ensaio).
- Sinalizar riscos e trade-offs em vez de escolher silenciosamente o caminho mais fácil.
- Não apagar ou reescrever funcionalidades existentes sem necessidade comprovada.
- Nunca colocar segredos, chaves ou senhas diretamente no código.

## Escopo desta etapa

Construir **somente** a base de autenticação e persistência de dados: tela de entrada, criação de
conta, login, logout e recuperação de senha. Nada de empresa, produtos, estoque, vendas, fluxo de
caixa, relatórios ou IA — isso vem em etapas futuras. Ao concluir esta etapa, **pare e aguarde
aprovação** antes de avançar.

---

## Passo 0 — Diagnóstico obrigatório (antes de escrever código)

1. Verificar se já existe um projeto/stack neste repositório. Se sim, mapear estrutura de pastas,
   dependências e se já há banco de dados configurado.
2. Se for um projeto novo, propor uma stack (ver sugestão abaixo) com uma justificativa curta.
3. **Apresentar o plano (stack, estrutura de pastas, principais decisões de segurança) e aguardar
   minha aprovação explícita antes de gerar uma quantidade significativa de código.** Isso evita
   retrabalho caro se alguma premissa estiver errada.

### Sugestão de stack (caso o projeto ainda não tenha uma definida)

| Camada | Sugestão | Por quê |
|---|---|---|
| Frontend | Next.js (React) + TypeScript | SSR/SSG, rotas protegidas nativas, ecossistema maduro |
| Backend | API routes do próprio Next.js ou Node/Express separado | Simplicidade inicial, fácil de separar depois |
| Banco de dados | PostgreSQL (ex.: Supabase, Neon ou RDS) | Relacional, maduro, suporta bem multi-tenant e crescimento |
| ORM | Prisma ou Drizzle | Migrations versionadas, type-safety, reduz risco de SQL injection |
| Autenticação | Auth.js (NextAuth) ou implementação própria com Lucia | Sessões seguras prontas, ou controle total se preferir construir do zero |
| Hash de senha | bcrypt (cost ≥ 12) ou argon2id | Padrão atual recomendado (OWASP) |
| Estilo | Tailwind CSS | Responsivo rápido, fácil de trocar identidade visual depois |

Se eu já tiver uma preferência de stack, ela tem prioridade — use esta tabela só como padrão de
fallback.

---

## 1. Tela inicial

```
            LOGO

    NOME DO SISTEMA

Seu sistema de gestão empresarial

    [ ENTRAR ]

 [ CRIAR CONTA ]

   Recuperar senha
```

Interface moderna, limpa, responsiva (desktop, tablet, celular), preparada para receber identidade
visual definitiva depois. Não implementar funcionalidades de etapas futuras.

## 2. Criar conta

Campos: Nome, E-mail, Senha, Confirmar senha. Botão **CRIAR CONTA**. Link "Já tenho uma conta →
Entrar".

**Validações (frontend E backend, nunca só uma das duas):**

- Nome obrigatório.
- E-mail obrigatório, formato válido, **normalizado para lowercase/trim antes de checar unicidade**
  (evita `User@x.com` e `user@x.com` virarem contas diferentes).
- Senha obrigatória, mínimo de 10 caracteres (priorize comprimento sobre complexidade artificial,
  seguindo as diretrizes atuais do NIST). Opcional: bloquear senhas triviais/comuns.
- Confirmação igual à senha.
- E-mail já cadastrado → cadastro recusado.

Mensagens de erro claras, ex.: "Digite seu e-mail.", "Este e-mail já está cadastrado.", "As senhas
não são iguais.", "A senha precisa ter pelo menos 10 caracteres."

> **Nota de segurança:** informar explicitamente "este e-mail já está cadastrado" no cadastro é
> conveniente para UX, mas tecnicamente permite enumerar contas existentes. É uma prática comum e
> aceitável para cadastro — mas no **login** e na **recuperação de senha**, use sempre mensagens
> genéricas (ver seções 4 e 8) para não vazar quais e-mails existem na base.

## 3. Login

Campos: E-mail, Senha. Botão **ENTRAR**. Links "Esqueci minha senha" e "Ainda não tenho uma conta →
Criar conta".

Mensagem de erro **genérica** para credenciais inválidas (ex.: "E-mail ou senha incorretos.") — não
diferenciar entre "usuário não existe" e "senha errada".

## 4. Autenticação real (nada de mock)

**Criação de conta:**
1. Validar dados.
2. Verificar unicidade do e-mail (normalizado).
3. Gerar hash da senha (bcrypt/argon2id) — nunca armazenar texto puro, nunca logar a senha.
4. Criar usuário no banco com identificador único (recomendo UUID em vez de ID sequencial, para não
   expor volume de usuários nem permitir enumeração por incremento).
5. Criar sessão/token de autenticação.
6. Permitir login futuro com a mesma conta.

**Login:**
1. Receber e-mail e senha.
2. Buscar usuário pelo e-mail normalizado.
3. Comparar senha com o hash usando a função de comparação da própria lib (constant-time, ex.:
   `bcrypt.compare`).
4. Criar sessão/token.
5. Redirecionar para `/dashboard`.

**Sessão/token:**
- Se usar sessão via cookie: `httpOnly`, `secure` (em produção), `sameSite=lax` ou `strict`, e
  expiração definida (ex.: 7 dias, renovável).
- Se usar JWT: expiração curta + estratégia de refresh token, e nunca guardar o token em
  `localStorage` (fica exposto a XSS) — prefira cookie httpOnly também nesse caso.
- Proteção CSRF se a autenticação for baseada em cookies.

## 5. Modelagem do banco de dados

Tabela `users` (mínimo):

| Campo | Tipo | Observação |
|---|---|---|
| id | UUID | chave primária |
| name | text | obrigatório |
| email | text | **único**, sempre armazenado normalizado (lowercase) |
| password_hash | text | nunca a senha em texto puro |
| created_at | timestamp | default now() |
| updated_at | timestamp | atualizado automaticamente |

Criar índice único em `email`. Usar migrations versionadas (não alterar schema manualmente).

## 6. Arquitetura preparada para o futuro (multi-tenant)

```
USUÁRIO → CONTA → EMPRESA → DADOS DA EMPRESA → DADOS FINANCEIROS → RELATÓRIOS → IA
```

Todo dado futuro deve referenciar `user_id` (ou `company_id` vinculado ao usuário) via chave
estrangeira. Um usuário nunca pode acessar dados de outro. Nesta etapa isso significa apenas:
modelar o `users.id` como a raiz de tudo que virá depois — não é necessário criar as tabelas de
empresa/produtos/vendas ainda.

> Para quando a etapa financeira chegar: vale considerar Row Level Security no Postgres como camada
> extra de isolamento entre usuários, além do filtro por `user_id` na aplicação. Só uma nota para o
> futuro, não implementar agora.

## 7. Recuperação de senha (fluxo real, não simulado)

Tela: "Recuperar senha" → campo de e-mail → botão **ENVIAR LINK**.

Fluxo esperado:
1. Gerar um token aleatório seguro (ex.: `crypto.randomBytes`), armazenar apenas o **hash** do token
   no banco (nunca o token em texto puro), com data de expiração curta (ex.: 30–60 minutos).
2. Endpoint para validar o token e permitir definir nova senha, expirando o token após o uso.
3. Resposta sempre genérica ("Se este e-mail existir, você receberá um link.") independentemente de
   o e-mail existir ou não, para não vazar quais contas existem.
4. Envio de e-mail: não é necessário configurar um provedor real agora se exigir credenciais
   externas — mas construa um `EmailService` como interface/adaptador, com uma implementação de
   desenvolvimento que loga o link no console (ou grava em arquivo local). Trocar para um provedor
   real (Resend, SendGrid, SES, Postmark) depois deve ser só implementar essa interface + variáveis
   de ambiente, sem mexer no resto do fluxo.

## 8. Segurança — checklist obrigatório

- [ ] Senha nunca em texto puro, em nenhum lugar (banco, logs, respostas de API).
- [ ] Hash com bcrypt (cost ≥ 12) ou argon2id.
- [ ] Validação de dados no frontend **e** no backend.
- [ ] Uso de ORM/queries parametrizadas — nunca concatenar SQL (evita SQL injection).
- [ ] Rate limiting em `/login`, `/register` e `/forgot-password` (ex.: N tentativas por IP/e-mail
      por minuto) para dificultar força bruta.
- [ ] Mensagens genéricas em login e recuperação de senha (evitar enumeração de usuários).
- [ ] Cookies/tokens de sessão com `httpOnly`, `secure`, `sameSite`.
- [ ] Rotas privadas (`/dashboard` e futuras) protegidas por middleware de autenticação.
- [ ] Variáveis de ambiente para tudo que for segredo (`.env`, nunca commitado — criar
      `.env.example` com as chaves sem valores reais).
- [ ] `.gitignore` cobrindo `.env`, `node_modules`, etc.
- [ ] Logout limpa a sessão/token no servidor (não só no cliente).
- [ ] Dados pessoais (nome, e-mail) tratados considerando a LGPD — nada além do necessário sendo
      coletado ou logado nesta etapa.

## 9. Logout

Botão "Sair" encerra a sessão no servidor (invalida o token/sessão, não apenas remove do cliente) e
redireciona para `/login`.

## 10. Rotas esperadas

```
/login
/register
/forgot-password
/dashboard   (protegida)
```

Acesso a `/dashboard` (e futuras áreas internas) sem autenticação → redirecionar para `/login`.

## 11. Testes obrigatórios

**Cenários funcionais (manuais ou automatizados via E2E):**

1. Criar conta nova → usuário criado no banco.
2. Criar conta com e-mail já existente → cadastro recusado.
3. Login com credenciais corretas → acesso ao dashboard.
4. Login com senha incorreta → login recusado, mensagem genérica.
5. Logout → sessão encerrada, retorno ao login.
6. Acesso a `/dashboard` sem autenticação → redirecionado para `/login`.
7. Fechar e reabrir o navegador → login continua funcionando com a conta criada.
8. Criar usuário → sair → entrar novamente → dados da conta continuam no banco.

**Testes automatizados adicionais (unitários/integração):**

9. Hash de senha nunca é igual à senha original, e `compare` funciona corretamente.
10. Tentativa de SQL injection nos campos de login/cadastro não quebra a query nem retorna dados
    indevidos.
11. Token de redefinição de senha expirado é rejeitado.
12. Rate limiting bloqueia após N tentativas de login malsucedidas.

## 12. Fora do escopo desta etapa

Não implementar ainda: cadastro de empresa, produtos, estoque, vendas, fluxo de caixa, despesas,
relatórios, IA, dashboard financeiro completo.

## 13. Definition of Done

- Tela de login funcionando.
- Criação de conta funcionando, com validações completas.
- Banco de dados configurado e funcional.
- Senha protegida com hash forte.
- Login e logout reais (não simulados).
- Recuperação de senha com fluxo real de token (envio de e-mail pode estar em modo dev).
- Rotas privadas protegidas.
- Cada usuário isolado dos dados dos demais.
- Persistência confirmada após sair e entrar novamente.
- Interface responsiva.
- Testes das seções 11 passando.

## 14. Ao concluir, reportar

1. Quais arquivos foram criados/alterados.
2. Qual banco de dados foi utilizado e por quê.
3. Como a autenticação funciona (hash, sessão/token, expiração).
4. Como rodar o projeto localmente (comandos, variáveis de ambiente necessárias em `.env.example`).
5. Quais testes foram executados e o resultado.
6. Qualquer configuração manual pendente (ex.: criar conta em um provedor de banco/e-mail).

**Depois de concluir esta etapa, pare e aguarde as próximas instruções — não avance para a Etapa 2
por conta própria.**
