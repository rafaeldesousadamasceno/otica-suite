/**
 * Erro tipado que os handlers de IPC sabem converter em ApiResult sem
 * vazar stack trace nem mensagem crua de excecao para a UI (o sistema
 * atual mostra `Exception` cru ao usuario em 30+ pontos - NF 8.2).
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const Errors = {
  naoAutenticado: () => new AppError('NAO_AUTENTICADO', 'Faça login para continuar.'),
  semPermissao: () => new AppError('SEM_PERMISSAO', 'Você não tem permissão para esta ação.'),
  credenciaisInvalidas: () => new AppError('CREDENCIAIS_INVALIDAS', 'Login ou senha incorretos.'),
  contaBloqueada: (ate: string) =>
    new AppError('CONTA_BLOQUEADA', `Conta temporariamente bloqueada até ${ate}.`),
  contaInativa: () => new AppError('CONTA_INATIVA', 'Este usuário está inativo.'),
  naoEncontrado: (entidade: string) => new AppError('NAO_ENCONTRADO', `${entidade} não encontrado.`),
  validacao: (message: string) => new AppError('VALIDACAO', message),
  conflito: (message: string) => new AppError('CONFLITO', message),
  jaConfigurado: () => new AppError('JA_CONFIGURADO', 'O sistema já foi configurado.'),
  /**
   * RF-03.4 / RN-07: a UI reconhece este `code` especificamente para abrir
   * o dialogo de credencial de Admin e reenviar a mesma acao com
   * `autorizacaoAdmin` preenchido - nao e so mais um erro de validacao.
   */
  autorizacaoAdminNecessaria: (motivo: string) => new AppError('AUTORIZACAO_ADMIN_NECESSARIA', motivo),
  /** RF-13.4/14.3: licenca vencida alem da carencia, ou teste encerrado - modo somente-leitura. */
  licencaVencida: () =>
    new AppError(
      'LICENCA_VENCIDA',
      'O sistema está em modo somente leitura (licença vencida ou período de teste encerrado) - faça backup dos dados e ative ou renove a licença para voltar a cadastrar e vender.'
    )
}
