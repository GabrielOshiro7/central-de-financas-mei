// Nome do produto (marca). TODO texto visível ao usuário que cita o nome do produto usa esta
// constante (títulos, metadata, páginas legais, textos de tela, logo). Não é um identificador
// interno: banco, cookies, chaves do navegador, variáveis de ambiente, pastas e o nome do pacote
// NÃO usam o nome da marca e não devem ser renomeados por causa dele.
export const BRAND_NAME = "MyWallet";

// A logo completa (símbolo + barra + nome) só é usada a partir desta altura (em px); abaixo disso
// usa-se só o símbolo (src/components/brand/BrandLogo.tsx aplica a regra sozinho).
export const MIN_FULL_LOGO_HEIGHT = 28;
