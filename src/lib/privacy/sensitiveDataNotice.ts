// Aviso padrao de TODOS os campos livres de observacao que podem guardar dados de terceiros
// (clientes, fornecedores): nao registrar saude nem outros dados sensiveis. Um texto so, em um lugar
// so - usado pelo componente SensitiveDataNotice e pelo modelo de importacao; um teste
// (tests/unit/sensitiveDataNotice.test.ts) garante que cada campo de observacao o usa.
export const SENSITIVE_DATA_NOTICE = "Não registre informações de saúde ou dados sensíveis de terceiros.";
