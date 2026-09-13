# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Donos de pequenos negócios brasileiros que administram as próprias finanças sozinhos, sem
equipe financeira dedicada — o onboarding cobre setores como restaurante, loja/varejo, serviços,
construção, e-commerce e academia (entre outros, via "Outro"). A relação é estritamente 1
usuário : 1 empresa (`Business.userId` é `@unique`); não há suporte a múltiplas empresas por
usuário nem a múltiplos usuários por empresa.

## Product Purpose

Sistema de gestão financeira para pequenos negócios: acompanhar receitas, custos e despesas,
contas a pagar/receber, posição de caixa, vendas e clientes em um único painel, com uma camada de
insights que interpreta automaticamente os números já lançados (sem duplicar cálculo nem inventar
dado). É um produto SaaS comercial — a intenção é lançar/vender, não uma ferramenta interna ou um
projeto de portfólio.

## Positioning

Substitui planilhas soltas e ferramentas financeiras genéricas por um fluxo guiado por tipo de
negócio (onboarding adaptado ao setor escolhido) que já nasce com contas a pagar/receber, caixa e
leitura automática de insights integrados nativamente ao mesmo conjunto de dados — não apenas um
livro-caixa de lançamentos manuais.

## Operating Context

- Onboarding em etapas (resumível) coleta tipo de negócio, modelo de receita, tempo de operação,
  número de funcionários, moeda e faturamento médio mensal antes de liberar o restante do sistema.
- Áreas principais depois do onboarding: Dashboard (visão financeira central), Caixa, Financeiro
  (lançamentos e categorias), Contas a pagar/receber, Clientes, Vendas, Insights, Assistente (chat,
  em desenvolvimento) e Configurações/Empresa.
- Interface e comunicação com o usuário são inteiramente em pt-BR.

## Capabilities and Constraints

- Um usuário gerencia exatamente uma empresa; não há hierarquia de papéis/permissões nem
  colaboração multiusuário na mesma empresa hoje.
- Moeda é escolhida explicitamente pelo usuário no onboarding (BRL, USD ou JPY) e nunca inferida
  por locale/navegador; trocar a moeda depois que a empresa já tem lançamentos é bloqueado na API.
- Valores monetários são sempre `Decimal` (nunca float) em todo o sistema, ponta a ponta.
- Cada etapa do produto entrega um recorte fechado de escopo (ver `CLAUDE.md`/prompts de etapa) —
  funcionalidade de uma etapa futura não deve vazar para uma etapa em andamento.

## Brand Commitments

Nenhum ainda. O produto não tem nome definido (o `README.md` ainda usa o placeholder "Nome do
Sistema" — decisão em aberto, não inventar um nome). Não há identidade visual/logo definidos; os
únicos assets em `public/` são os SVGs padrão do scaffold do Next.js.

## Evidence on Hand

Nenhum dado real de cliente, depoimento, caso de uso, benchmark ou dado de mercado disponível.
Trabalho futuro não deve fabricar nenhum desses.

## Product Principles

1. Os números do usuário são a única fonte da verdade — nenhuma camada de leitura/análise
   (dashboard, insights) inventa, aproxima ou recalcula dado que já existe em
   `FinancialEntry`/`Bill`/`Sale`.
2. Onboarding guiado por tipo de negócio reduz a fricção para quem não tem formação financeira.
3. Simplicidade sobre completude: cada etapa entrega um escopo fechado, sem antecipar
   funcionalidade de etapas futuras.
4. Precisão e isolamento financeiro (Decimal, moeda explícita, dados sempre escopados por
   empresa) são inegociáveis mesmo antes de qualquer decisão de personalização visual.
