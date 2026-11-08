import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'
import type { ClienteOrigemRow, ExameOrigemRow } from '@main/migracao/mysqlSource'
import type { MigracaoAprovacoes } from '@shared/importacao'

const { banco, origem, backup } = vi.hoisted(() => ({
  banco: { db: null as DatabaseSync | null },
  origem: { clientes: [] as unknown[], exames: [] as unknown[] },
  backup: { chamadas: 0, integro: true, lanca: false }
}))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))
vi.mock('@main/auth/session', () => ({ requirePermissao: () => ({ usuario: { id: 1, perfil: 'admin' } }) }))
// O MySQL do MD Oculos e o arquivo de backup ficam de fora: aqui interessa a regra de quem entra e quem sai.
vi.mock('@main/migracao/mysqlSource', () => ({
  lerClientes: async () => origem.clientes,
  lerExames: async () => origem.exames,
  lerDespesas: async () => []
}))
vi.mock('@main/repositories/backupRepository', () => ({
  criarArquivoBackup: () => {
    backup.chamadas++
    if (backup.lanca) throw new Error('disco cheio')
    return { arquivo: 'backup.db', tamanhoBytes: 1, integro: backup.integro }
  }
}))

import { migracaoService } from './migracaoService'
import { migracaoPendenciaService } from './migracaoPendenciaService'

const CONFIG = { host: 'localhost', porta: 3306, usuario: 'root', senha: '', banco: 'mdoculos' }
const APROVA_TUDO: MigracaoAprovacoes = { mesclarDuplicados: true, removerCpfConflitante: true, removerRegistrosVazios: true }
const NAO_APROVA: MigracaoAprovacoes = { mesclarDuplicados: false, removerCpfConflitante: false, removerRegistrosVazios: false }

// CPFs matematicamente validos.
const CPF_A = '529.982.247-25'
const CPF_A_DIGITOS = '52998224725'

const CAMPOS_EXAME_NULOS = [
  'plonge_od_esf', 'plonge_oe_esf', 'plonge_od_cil', 'plonge_oe_cil', 'plonge_od_eixo', 'plonge_oe_eixo',
  'plonge_od_dnp', 'plonge_oe_dnp', 'pperto_od_esf', 'pperto_oe_esf', 'pperto_od_cil', 'pperto_oe_cil',
  'pperto_od_eixo', 'pperto_oe_eixo', 'pperto_od_dnp', 'pperto_oe_dnp', 'adicao', 'lentes', 'tratamentos',
  'armacao', 'observacao', 'valor_exame', 'valor_oculos', 'forma_pgto', 'laboratorio', 'med_opto',
  'data_saida', 'data_chegada', 'situacao', 'data_venda'
]

function cliente(id: number, nome: string | null, extras: Partial<ClienteOrigemRow> = {}): ClienteOrigemRow {
  return {
    id_cliente: id,
    nome,
    data_nasc: null,
    cpf: null,
    celular: null,
    logradouro: null,
    numero: null,
    complemento: null,
    bairro: null,
    cidade: null,
    uf: null,
    ...extras
  }
}

function exame(id: number, idCliente: number | null, extras: Partial<ExameOrigemRow> = {}): ExameOrigemRow {
  const nulos = Object.fromEntries(CAMPOS_EXAME_NULOS.map((k) => [k, null]))
  // Por padrao o exame tem conteudo (armacao): um exame totalmente em branco e tratado como registro vazio.
  return { ...nulos, id_exame: id, id_cliente: idCliente, data_exame: '2024-03-10', armacao: 'ARMAÇÃO TESTE', ...extras } as ExameOrigemRow
}

/** Simula um cliente que entrou numa importacao feita antes da regra existir. */
function clienteJaImportado(origemId: number, nome: string, cpf: string | null = null): number {
  const db = banco.db!
  const id = Number(db.prepare('INSERT INTO cliente (nome, cpf) VALUES (:nome, :cpf)').run({ nome, cpf }).lastInsertRowid)
  db.prepare(
    `INSERT INTO migracao_registro (origem_sistema, origem_tabela, origem_id, destino_tabela, destino_id)
     VALUES ('mdoculos', 'clientes', :origemId, 'cliente', :id)`
  ).run({ origemId, id })
  return id
}

function nomesNoBanco(): string[] {
  return (banco.db!.prepare('SELECT nome FROM cliente ORDER BY id').all() as { nome: string }[]).map((r) => r.nome)
}

function clientesNoBanco(): { id: number; nome: string; cpf: string | null; observacao: string | null }[] {
  return banco.db!.prepare('SELECT id, nome, cpf, observacao FROM cliente ORDER BY id').all() as never
}

function pendencias(): { id: number; tipo: string; status: string; origem_tabela: string; origem_id: number; destino_id: number | null; dados_json: string | null }[] {
  return banco
    .db!.prepare('SELECT id, tipo, status, origem_tabela, origem_id, destino_id, dados_json FROM migracao_pendencia ORDER BY id')
    .all() as never
}

function importar(aprovacoes: MigracaoAprovacoes = APROVA_TUDO) {
  return migracaoService.importar({ conexao: CONFIG, aprovacoes })
}

beforeEach(() => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS) db.exec(m.sql)
  db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana', 'x', 'admin')").run()
  banco.db = db
  backup.chamadas = 0
  backup.integro = true
  backup.lanca = false
})

describe('migracaoService.importar - clientes sem nome', () => {
  it('nao importa cliente sem nome e sem receita, mas importa o sem nome que tem receita', async () => {
    origem.clientes = [cliente(1, 'MARIA SILVA'), cliente(2, ''), cliente(3, null), cliente(4, '   ')]
    origem.exames = [exame(10, 4)]

    const r = await importar()

    expect(r.clientesImportados).toBe(2)
    expect(r.clientesSemNomeIgnorados).toBe(2)
    expect(r.clientesSemNomeRemovidos).toBe(0)
    expect(r.examesImportados).toBe(1)
    expect(nomesNoBanco()).toEqual(['MARIA SILVA', ''])
  })

  it('remove na proxima importacao os sem nome e sem receita que ja tinham entrado', async () => {
    clienteJaImportado(2, '')
    clienteJaImportado(3, 'Preenchido Depois')
    origem.clientes = [cliente(2, ''), cliente(3, '')]
    origem.exames = []

    const r = await importar()

    expect(r.clientesSemNomeRemovidos).toBe(1)
    expect(r.clientesJaImportados).toBe(1)
    expect(nomesNoBanco()).toEqual(['Preenchido Depois'])

    const auditoria = banco
      .db!.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE acao = 'REMOVER_CLIENTES_SEM_NOME'")
      .get() as { n: number }
    expect(auditoria.n).toBe(1)

    // Rodar de novo nao remove mais nada.
    const segunda = await importar()
    expect(segunda.clientesSemNomeRemovidos).toBe(0)
  })
})

describe('migracaoService.importar - backup obrigatorio', () => {
  it('tira o backup antes de gravar e informa o arquivo', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = []
    const r = await importar()
    expect(backup.chamadas).toBe(1)
    expect(r.backupArquivo).toBe('backup.db')
  })

  it('se o backup falhar, nao importa nada', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = []
    backup.lanca = true

    await expect(importar()).rejects.toThrow(/backup de segurança/)
    expect(nomesNoBanco()).toEqual([])
  })

  it('backup sem integridade tambem aborta', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = []
    backup.integro = false

    await expect(importar()).rejects.toThrow(/backup de segurança/)
    expect(nomesNoBanco()).toEqual([])
  })
})

describe('migracaoService.importar - CPF', () => {
  it('grava o CPF so com digitos', async () => {
    origem.clientes = [cliente(1, 'ANA', { cpf: CPF_A })]
    origem.exames = []
    await importar()
    expect(clientesNoBanco()[0].cpf).toBe(CPF_A_DIGITOS)
  })

  it('CPF invalido: importa sem CPF, guarda o original na observacao e avisa', async () => {
    origem.clientes = [cliente(1, 'ANA', { cpf: '123.456.789-00' })]
    origem.exames = []

    const r = await importar()

    const [c] = clientesNoBanco()
    expect(c.cpf).toBeNull()
    expect(c.observacao).toContain('123.456.789-00')
    expect(r.pendenciasAbertas.CPF_INVALIDO).toBe(1)
    expect(pendencias()[0]).toMatchObject({ tipo: 'CPF_INVALIDO', origem_tabela: 'clientes', origem_id: 1, destino_id: c.id })
  })

  it('mesma pessoa repetida: une os cadastros e os exames dos dois ficam no mesmo cliente', async () => {
    origem.clientes = [
      cliente(84, 'Priscila Alves', { cpf: CPF_A, data_nasc: '1990-05-01' }),
      cliente(301, 'PRÍSCILA ALVES', { cpf: CPF_A, data_nasc: '1990-05-01', celular: '(85) 98888-7777' })
    ]
    origem.exames = [exame(10, 84), exame(11, 301)]

    const r = await importar()

    expect(r.clientesImportados).toBe(1)
    expect(r.clientesMesclados).toBe(1)
    expect(r.examesImportados).toBe(2)
    expect(clientesNoBanco()).toHaveLength(1)
    const donos = banco.db!.prepare('SELECT DISTINCT cliente_id FROM receita_optica').all()
    expect(donos).toHaveLength(1)
    // O que faltava no principal e preenchido com o do duplicado.
    expect((banco.db!.prepare('SELECT celular FROM cliente').get() as { celular: string }).celular).toBe('(85) 98888-7777')
    expect(pendencias().find((p) => p.tipo === 'CPF_MESCLADO')).toMatchObject({ origem_id: 301 })
  })

  it('pessoas diferentes com o mesmo CPF: importa as duas e tira o CPF de uma, guardando o original', async () => {
    origem.clientes = [cliente(1, 'ANA SOUZA', { cpf: CPF_A }), cliente(2, 'JOÃO SOUZA', { cpf: CPF_A })]
    origem.exames = [exame(10, 1), exame(11, 2)]

    const r = await importar()

    expect(r.clientesImportados).toBe(2)
    expect(r.clientesMesclados).toBe(0)
    expect(r.examesImportados).toBe(2)
    const clientes = clientesNoBanco()
    expect(clientes.filter((c) => c.cpf === CPF_A_DIGITOS)).toHaveLength(1)
    const semCpf = clientes.find((c) => c.cpf === null)!
    expect(semCpf.observacao).toContain(CPF_A)
    expect(pendencias().find((p) => p.tipo === 'CPF_REMOVIDO')).toBeDefined()
  })

  it('sem aprovacao nao mexe em nada: o repetido nao entra, com motivo claro, e o exame dele explica por que', async () => {
    origem.clientes = [cliente(1, 'ANA SOUZA', { cpf: CPF_A }), cliente(2, 'JOÃO SOUZA', { cpf: CPF_A })]
    origem.exames = [exame(10, 1), exame(11, 2)]

    const r = await importar(NAO_APROVA)

    expect(r.clientesImportados).toBe(1)
    expect(r.clientesComFalha).toBe(1)
    expect(r.examesImportados).toBe(1)
    expect(r.examesComFalha).toBe(1)
    const tipos = pendencias().map((p) => p.tipo)
    expect(tipos).toContain('CPF_DUPLICADO')
    expect(tipos).toContain('CLIENTE_FALHOU')
  })

  it('une ao cliente que ja existe aqui, mesmo gravado com mascara', async () => {
    const existente = clienteJaImportado(900, 'Ana Souza', CPF_A) // gravado com mascara, de uma importacao antiga
    origem.clientes = [cliente(900, 'ANA SOUZA', { cpf: CPF_A }), cliente(2, 'ANA SOUZA', { cpf: CPF_A_DIGITOS })]
    origem.exames = [exame(11, 2)]

    const r = await importar()

    expect(r.clientesMesclados).toBe(1)
    expect(clientesNoBanco()).toHaveLength(1)
    expect((banco.db!.prepare('SELECT cliente_id FROM receita_optica').get() as { cliente_id: number }).cliente_id).toBe(existente)
  })

  it('cliente ja importado com CPF mascarado: padroniza para so digitos', async () => {
    const id = clienteJaImportado(1, 'ANA', CPF_A)
    origem.clientes = [cliente(1, 'ANA', { cpf: CPF_A })]
    origem.exames = []

    await importar()

    expect((banco.db!.prepare('SELECT cpf FROM cliente WHERE id = :id').get({ id }) as { cpf: string }).cpf).toBe(CPF_A_DIGITOS)
  })

  it('dois ja importados com o mesmo CPF escrito diferente: nao mexe, avisa', async () => {
    clienteJaImportado(1, 'ANA', CPF_A)
    clienteJaImportado(2, 'BETO', CPF_A_DIGITOS)
    origem.clientes = [cliente(1, 'ANA', { cpf: CPF_A }), cliente(2, 'BETO', { cpf: CPF_A_DIGITOS })]
    origem.exames = []

    await importar()

    expect(clientesNoBanco().map((c) => c.cpf)).toEqual([CPF_A, CPF_A_DIGITOS])
    expect(pendencias().filter((p) => p.tipo === 'CPF_DUPLICADO')).toHaveLength(2)
  })
})

describe('migracaoService.importar - exames sem cliente', () => {
  it('diferencia as tres causas, cada uma com mensagem propria', async () => {
    origem.clientes = [cliente(1, 'ANA SOUZA', { cpf: CPF_A }), cliente(2, 'JOÃO SOUZA', { cpf: CPF_A })]
    origem.exames = [exame(20, null), exame(21, 999), exame(23, 1), exame(24, 1), exame(22, 2)]

    await importar(NAO_APROVA)

    const tipos = Object.fromEntries(pendencias().filter((p) => p.origem_tabela === 'exames').map((p) => [p.origem_id, p.tipo]))
    expect(tipos).toEqual({ 20: 'EXAME_SEM_CLIENTE', 21: 'CLIENTE_INEXISTENTE_NA_ORIGEM', 22: 'CLIENTE_FALHOU' })
  })

  it('resolvido o cliente, o exame entra sozinho na proxima importacao e a pendencia fecha', async () => {
    origem.clientes = [cliente(1, 'ANA SOUZA', { cpf: CPF_A }), cliente(2, 'JOÃO SOUZA', { cpf: CPF_A })]
    origem.exames = [exame(23, 1), exame(24, 1), exame(22, 2)]
    await importar(NAO_APROVA)
    expect(pendencias().some((p) => p.tipo === 'CLIENTE_FALHOU' && p.status === 'ABERTA')).toBe(true)

    const r = await importar(APROVA_TUDO)

    expect(r.examesImportados).toBe(1)
    expect(pendencias().filter((p) => ['CLIENTE_FALHOU', 'CPF_DUPLICADO'].includes(p.tipo)).every((p) => p.status === 'RESOLVIDA')).toBe(true)
  })
})

describe('migracaoService.importar - datas', () => {
  // exame 22/10/2024 mas venda e chegada em novembro de 2023: o ano do exame esta errado.
  const exameComAnoErrado = (): ExameOrigemRow =>
    exame(30, 1, { data_exame: '2024-10-22', data_venda: '2023-11-03', data_chegada: '2023-11-20', situacao: 'ENTREGUE' })

  it('importa como esta e alerta com a correcao sugerida (troca do ano)', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = [exameComAnoErrado()]

    const r = await importar()

    expect(r.examesImportados).toBe(1)
    expect((banco.db!.prepare('SELECT data_exame FROM receita_optica').get() as { data_exame: string }).data_exame).toBe('2024-10-22')
    const p = pendencias().find((x) => x.tipo === 'DATA_INCOERENTE')!
    expect(JSON.parse(p.dados_json!)).toMatchObject({ campo: 'data_exame', atual: '2024-10-22', sugerido: '2023-10-22', origemExame: '2024-10-22' })
  })

  it('aplicar a sugestao corrige receita, OS e fecha a pendencia, com auditoria', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = [exameComAnoErrado()]
    await importar()
    const p = pendencias().find((x) => x.tipo === 'DATA_INCOERENTE')!

    migracaoPendenciaService.aplicarSugestao(p.id)

    const db = banco.db!
    expect((db.prepare('SELECT data_exame FROM receita_optica').get() as { data_exame: string }).data_exame).toBe('2023-10-22')
    expect((db.prepare('SELECT data_abertura FROM ordem_servico').get() as { data_abertura: string }).data_abertura).toBe('2023-10-22')
    expect(pendencias().find((x) => x.id === p.id)!.status).toBe('RESOLVIDA')
    const aud = db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE acao = 'CORRIGIR_DATA_IMPORTADA'").get() as { n: number }
    expect(aud.n).toBe(1)

    // Reimportar nao reabre nem duplica.
    await importar()
    expect(pendencias().filter((x) => x.tipo === 'DATA_INCOERENTE')).toHaveLength(1)
    expect(pendencias().find((x) => x.id === p.id)!.status).toBe('RESOLVIDA')
  })

  it('nao aplica se alguem ja mudou a data depois da importacao', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = [exameComAnoErrado()]
    await importar()
    const p = pendencias().find((x) => x.tipo === 'DATA_INCOERENTE')!
    banco.db!.prepare("UPDATE receita_optica SET data_exame = '2023-10-25'").run()

    expect(() => migracaoPendenciaService.aplicarSugestao(p.id)).toThrow(/já foi alterada/)
    expect((banco.db!.prepare('SELECT data_exame FROM receita_optica').get() as { data_exame: string }).data_exame).toBe('2023-10-25')
  })

  it('exame ja importado antes desta regra tambem e avaliado', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = [exame(30, 1, { data_exame: '2024-10-22', data_venda: '2023-11-03', data_chegada: '2023-11-20' })]
    await importar()
    banco.db!.prepare('DELETE FROM migracao_pendencia').run() // como se a importacao tivesse sido feita antes de existir o alerta

    await importar()

    expect(pendencias().filter((x) => x.tipo === 'DATA_INCOERENTE')).toHaveLength(1)
  })

  it('nao alerta quando o administrador ja corrigiu a data', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = [exameComAnoErrado()]
    await importar()
    banco.db!.prepare('DELETE FROM migracao_pendencia').run()
    banco.db!.prepare("UPDATE receita_optica SET data_exame = '2023-10-22'").run()

    await importar()

    expect(pendencias()).toEqual([])
  })

  it('data inexistente (0000-00-00) vira pendencia e nao e gravada como esta', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = [exame(31, 1, { data_exame: '0000-00-00', data_venda: '2024-02-10' })]

    await importar()

    expect(pendencias().map((p) => p.tipo)).toEqual(['DATA_INVALIDA'])
    expect(JSON.parse(pendencias()[0].dados_json!)).toMatchObject({ origemExame: '0000-00-00', sugerido: '2024-02-10', estimativa: 'sim' })
    expect((banco.db!.prepare('SELECT data_exame FROM receita_optica').get() as { data_exame: string }).data_exame).toBe('2024-02-10')
  })

  it('datas em ordem nao geram alerta', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = [exame(32, 1, { data_exame: '2024-02-01', data_venda: '2024-02-10', data_saida: '2024-02-11', data_chegada: '2024-02-20' })]
    await importar()
    expect(pendencias()).toEqual([])
  })
})

describe('migracaoService.analisar', () => {
  it('mostra o que vai acontecer sem gravar nada', async () => {
    origem.clientes = [
      cliente(1, 'ANA SOUZA', { cpf: CPF_A }),
      cliente(2, 'ANA SOUZA', { cpf: CPF_A }),
      cliente(3, 'BETO', { cpf: '000.000.000-00' }),
      cliente(4, '')
    ]
    origem.exames = [exame(10, 1), exame(11, 999), exame(12, 3, { data_exame: '2024-10-22', data_venda: '2023-11-03' })]

    const a = await migracaoService.analisar(CONFIG)

    expect(a.clientesLidos).toBe(4)
    expect(a.clientesAImportar).toBe(3)
    expect(a.clientesSemNome).toBe(1)
    expect(a.examesAImportar).toBe(2)
    expect(a.porTipo.CPF_MESCLADO).toBe(1)
    expect(a.porTipo.CPF_INVALIDO).toBe(1)
    expect(a.porTipo.CLIENTE_INEXISTENTE_NA_ORIGEM).toBe(1)
    expect(a.porTipo.DATA_INCOERENTE).toBe(1)

    for (const tabela of ['cliente', 'receita_optica', 'venda', 'migracao_registro', 'migracao_pendencia']) {
      expect((banco.db!.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get() as { n: number }).n).toBe(0)
    }
    expect(backup.chamadas).toBe(0)
  })
})

describe('migracaoPendenciaService - resolver direto no sistema', () => {
  const exameComAnoErrado = (id = 30): ExameOrigemRow =>
    exame(id, 1, { data_exame: '2024-10-22', data_venda: '2023-11-03', data_chegada: '2023-11-20' })

  const pendenciaDeData = (): { id: number } => pendencias().find((x) => x.tipo === 'DATA_INCOERENTE')!

  it('informar a data certa corrige a receita e a OS, sem mexer na data da venda, e fecha a pendencia', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = [exameComAnoErrado()]
    await importar()

    const r = migracaoPendenciaService.corrigirDatas({ id: pendenciaDeData().id, alteracoes: [{ campo: 'data_exame', data: '2023-10-25' }], concluir: true })

    expect(r.resolvida).toBe(true)
    const db = banco.db!
    expect((db.prepare('SELECT data_exame FROM receita_optica').get() as { data_exame: string }).data_exame).toBe('2023-10-25')
    expect((db.prepare('SELECT data_abertura FROM ordem_servico').get() as { data_abertura: string }).data_abertura).toBe('2023-10-25')
    expect((db.prepare('SELECT data FROM venda').get() as { data: string }).data).toBe('2023-11-03')
    expect(pendencias().find((x) => x.tipo === 'DATA_INCOERENTE')!.status).toBe('RESOLVIDA')
  })

  it('se a data informada ainda nao fecha, a pendencia continua aberta com o texto atualizado', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = [exameComAnoErrado()]
    await importar()
    const id = pendenciaDeData().id

    const r = migracaoPendenciaService.corrigirDatas({ id, alteracoes: [{ campo: 'data_exame', data: '2024-01-05' }], concluir: false })

    expect(r.resolvida).toBe(false)
    const [p] = migracaoPendenciaService.listar({ status: 'ABERTA', tipo: 'DATA_INCOERENTE' })
    expect(p.id).toBe(id)
    expect(p.motivo).toContain('05/01/2024')
  })

  it('recusa data invalida, no futuro ou igual a que ja esta', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = [exameComAnoErrado()]
    await importar()
    const id = pendenciaDeData().id

    expect(() => migracaoPendenciaService.corrigirDatas({ id, alteracoes: [{ campo: 'data_exame', data: '2024-02-30' }], concluir: false })).toThrow(/data válida/)
    expect(() => migracaoPendenciaService.corrigirDatas({ id, alteracoes: [{ campo: 'data_exame', data: '2999-01-01' }], concluir: false })).toThrow(/futuro/)
    expect(() => migracaoPendenciaService.corrigirDatas({ id, alteracoes: [], concluir: false })).toThrow(/Nenhuma data/)
  })

  it('exame sem data: informar a data do exame nao muda a da venda', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = [exame(31, 1, { data_exame: null, data_venda: '2024-02-10' })]
    await importar()
    const ausente = pendencias().find((x) => x.tipo === 'DATA_AUSENTE')!

    const r = migracaoPendenciaService.corrigirDatas({ id: ausente.id, alteracoes: [{ campo: 'data_exame', data: '2024-02-01' }], concluir: true })

    expect(r.resolvida).toBe(true)
    expect((banco.db!.prepare('SELECT data_exame FROM receita_optica').get() as { data_exame: string }).data_exame).toBe('2024-02-01')
    expect((banco.db!.prepare('SELECT data FROM venda').get() as { data: string }).data).toBe('2024-02-10')
  })

  it('mostra as datas atuais do exame', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = [exameComAnoErrado()]
    await importar()
    expect(migracaoPendenciaService.datasAtuais(pendenciaDeData().id)).toEqual({
      data_exame: '2024-10-22',
      data_venda: '2023-11-03',
      data_saida: null,
      data_chegada: '2023-11-20'
    })
  })

  it('aplica varias sugestoes de uma vez e conta as que nao deu', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = [exameComAnoErrado(30), exameComAnoErrado(31)]
    await importar()
    const ids = pendencias().filter((x) => x.tipo === 'DATA_INCOERENTE').map((x) => x.id)
    banco.db!.prepare("UPDATE receita_optica SET data_exame = '2023-10-25' WHERE id = (SELECT MIN(id) FROM receita_optica)").run() // alguem ja mexeu em um deles

    const r = migracaoPendenciaService.aplicarVarias(ids)

    expect(r).toEqual({ aplicadas: 1, puladas: 1 })
  })

  it('ignora varias de uma vez e o resumo conta por tipo e situacao', async () => {
    origem.clientes = [cliente(1, 'ANA SOUZA', { cpf: '123.456.789-00' }), cliente(2, 'BETO', { cpf: '987.654.321-99' })]
    origem.exames = []
    await importar()
    expect(migracaoPendenciaService.resumo('ABERTA')).toEqual({ CPF_INVALIDO: 2 })

    const r = migracaoPendenciaService.ignorarVarias(pendencias().map((p) => p.id))

    expect(r.ignoradas).toBe(2)
    expect(migracaoPendenciaService.resumo('ABERTA')).toEqual({})
    expect(migracaoPendenciaService.resumo('IGNORADA')).toEqual({ CPF_INVALIDO: 2 })
    // Reimportar nao reabre.
    await importar()
    expect(migracaoPendenciaService.resumo('ABERTA')).toEqual({})
  })
})

describe('migracaoPendenciaService - exame com data que nao existe', () => {
  it('mostra os detalhes do exame e aplica a data da venda como ponto de partida, so se for reserva', async () => {
    origem.clientes = [cliente(1, 'ANA SOUZA', { celular: '(85) 98888-7777' })]
    origem.exames = [
      exame(40, 1, { data_exame: '2026-18-22', data_venda: '2024-02-10', armacao: 'RAY BAN', lentes: 'MULTIFOCAL', laboratorio: 'LAB X', valor_oculos: '350.00' })
    ]
    await importar()
    const p = pendencias().find((x) => x.tipo === 'DATA_INVALIDA')!

    const d = migracaoPendenciaService.detalhes(p.id)
    expect(d.cliente.nome).toBe('ANA SOUZA')
    expect(d.item).toContain('RAY BAN')
    expect(d.laboratorio).toBe('LAB X')
    expect(d.datas.venda).toBe('2024-02-10')
    expect(d.valorCentavos).toBe(35000)

    migracaoPendenciaService.aplicarSugestao(p.id)

    expect((banco.db!.prepare('SELECT data_exame FROM receita_optica').get() as { data_exame: string }).data_exame).toBe('2024-02-10')
    expect(pendencias().find((x) => x.id === p.id)!.status).toBe('RESOLVIDA')
  })

  it('nao sobrescreve uma data real que alguem ja informou', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = [exame(40, 1, { data_exame: '0000-00-00', data_venda: '2024-02-10' })]
    await importar()
    const p = pendencias().find((x) => x.tipo === 'DATA_INVALIDA')!
    banco.db!.prepare("UPDATE receita_optica SET data_exame = '2024-02-03'").run()

    expect(() => migracaoPendenciaService.aplicarSugestao(p.id)).toThrow(/já foi alterada/)
  })

  it('pendencia antiga que a analise nao reconhece mais se fecha sozinha ao importar de novo', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = [exame(40, 1, { data_exame: '2024-02-01', data_venda: '2024-02-10' })]
    await importar()
    // Como se uma versao antiga tivesse gravado um alerta que hoje nao procede.
    banco
      .db!.prepare("INSERT INTO migracao_pendencia (tipo, gravidade, origem_tabela, origem_id, motivo) VALUES ('DATA_AUSENTE', 'atencao', 'exames', 40, 'texto antigo')")
      .run()

    await importar()

    expect(pendencias().find((x) => x.tipo === 'DATA_AUSENTE')!.status).toBe('RESOLVIDA')
  })
})

describe('migracaoPendenciaService - corrigir varias datas sem fechar a pendencia', () => {
  // exame, venda, envio e chegada todos com o ano errado
  const tudoErrado = (): ExameOrigemRow =>
    exame(50, 1, { data_exame: '2026-10-22', data_venda: '2025-10-25', data_saida: '2025-10-26', data_chegada: '2025-10-30' })

  it('salvar uma data NAO fecha a pendencia: da para corrigir as outras em seguida', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    // Intervalo longo: o exame e a venda estao certos entre si, mas a chegada esta anos depois.
    origem.exames = [exame(50, 1, { data_exame: '2024-03-01', data_venda: '2024-03-02', data_saida: '2024-03-03', data_chegada: '2027-03-10' })]
    await importar()
    const p = pendencias().find((x) => x.tipo === 'DATA_INCOERENTE')!
    expect(p).toBeDefined()

    // Corrige so o envio (ainda ha o problema da chegada): a pendencia continua aberta.
    const r1 = migracaoPendenciaService.corrigirDatas({ id: p.id, alteracoes: [{ campo: 'data_saida', data: '2024-03-04' }], concluir: false })
    expect(r1.aplicadas).toBe(1)
    expect(r1.resolvida).toBe(false)
    expect(r1.avisos.length).toBeGreaterThan(0)
    expect(pendencias().find((x) => x.id === p.id)!.status).toBe('ABERTA')

    // Agora a chegada, e conclui.
    const r2 = migracaoPendenciaService.corrigirDatas({ id: p.id, alteracoes: [{ campo: 'data_chegada', data: '2024-03-12' }], concluir: true })
    expect(r2.avisos).toEqual([])
    expect(r2.resolvida).toBe(true)
    expect(pendencias().find((x) => x.id === p.id)!.status).toBe('RESOLVIDA')
  })

  it('aplica varias datas de uma vez, na mesma chamada', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = [tudoErrado()]
    await importar()
    const p = pendencias().find((x) => x.origem_id === 50)!

    const r = migracaoPendenciaService.corrigirDatas({
      id: p.id,
      alteracoes: [
        { campo: 'data_exame', data: '2025-10-22' },
        { campo: 'data_venda', data: '2025-10-24' },
        { campo: 'data_saida', data: '2025-10-27' }
      ],
      concluir: false
    })

    expect(r.aplicadas).toBe(3)
    const db = banco.db!
    expect((db.prepare('SELECT data_exame FROM receita_optica').get() as { data_exame: string }).data_exame).toBe('2025-10-22')
    expect((db.prepare('SELECT data FROM venda').get() as { data: string }).data).toBe('2025-10-24')
    expect((db.prepare('SELECT data_envio FROM ordem_servico').get() as { data_envio: string }).data_envio).toBe('2025-10-27')
  })

  it('uma data invalida no meio recusa tudo: nada e gravado pela metade', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = [tudoErrado()]
    await importar()
    const p = pendencias().find((x) => x.origem_id === 50)!

    expect(() =>
      migracaoPendenciaService.corrigirDatas({
        id: p.id,
        alteracoes: [
          { campo: 'data_exame', data: '2025-10-22' },
          { campo: 'data_venda', data: '2025-02-30' }
        ],
        concluir: false
      })
    ).toThrow(/data válida/)
    expect((banco.db!.prepare('SELECT data_exame FROM receita_optica').get() as { data_exame: string }).data_exame).toBe('2026-10-22')
  })

  it('concluir sem alterar nada apenas fecha a pendencia', async () => {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = [tudoErrado()]
    await importar()
    const p = pendencias().find((x) => x.origem_id === 50)!

    const r = migracaoPendenciaService.corrigirDatas({ id: p.id, alteracoes: [], concluir: true })

    expect(r).toMatchObject({ aplicadas: 0, resolvida: true })
    expect(pendencias().find((x) => x.id === p.id)!.status).toBe('RESOLVIDA')
  })
})

describe('migracaoService - encerrar entregas antigas em aberto', () => {
  const situacoes = () =>
    banco.db!.prepare('SELECT numero, situacao, data_entrega FROM ordem_servico ORDER BY id').all() as { numero: string; situacao: string; data_entrega: string | null }[]

  async function importarTresOs(): Promise<void> {
    origem.clientes = [cliente(1, 'ANA')]
    origem.exames = [
      exame(60, 1, { data_exame: '2024-03-01', situacao: 'ENTREGUE', data_chegada: '2024-03-10' }),
      exame(61, 1, { data_exame: '2024-04-01', data_venda: '2024-04-02' }), // EM ABERTO
      exame(62, 1, { data_exame: '2024-05-01', data_saida: '2024-05-02', data_chegada: '2024-12-20', situacao: 'LABORATORIO' }) // chegada depois da data escolhida
    ]
    await importar()
  }

  it('resume quantas estao abertas e sugere o ultimo dia de movimento', async () => {
    await importarTresOs()
    const r = migracaoService.osAntigasAbertas()
    expect(r.total).toBeGreaterThanOrEqual(1)
    expect(r.sugestaoData).toBeTruthy()
    expect(r.sugestaoData! <= new Date().toISOString().slice(0, 10)).toBe(true)
    expect(r.maisAntiga).toBe('2024-04-01')
  })

  it('marca todas como entregues na data escolhida, sem ficar antes do que a OS ja tem, com backup e auditoria', async () => {
    await importarTresOs()
    const antes = backup.chamadas

    const r = await migracaoService.encerrarOsAntigasAbertas('2024-06-30')

    expect(backup.chamadas).toBe(antes + 1)
    expect(r.encerradas).toBeGreaterThanOrEqual(1)
    const lista = situacoes()
    expect(lista.every((o) => o.situacao === 'ENTREGUE')).toBe(true)
    expect(lista.find((o) => o.numero === 'MDO-61')!.data_entrega).toBe('2024-06-30')
    // A OS que ja tinha chegada em dezembro nao ganha entrega antes da chegada.
    expect(lista.find((o) => o.numero === 'MDO-62')!.data_entrega! >= '2024-12-20').toBe(true)
    expect(migracaoService.osAntigasAbertas().total).toBe(0)
    const aud = banco.db!.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE acao = 'ENCERRAR_OS_ANTIGAS'").get() as { n: number }
    expect(aud.n).toBe(1)
  })

  it('so mexe nas OS antigas: uma OS nova em aberto fica como esta', async () => {
    await importarTresOs()
    banco.db!.prepare("INSERT INTO ordem_servico (numero, cliente_id, situacao) VALUES ('2026-00001', 1, 'EM ABERTO')").run()

    await migracaoService.encerrarOsAntigasAbertas('2024-06-30')

    expect(situacoes().find((o) => o.numero === '2026-00001')!.situacao).toBe('EM ABERTO')
  })

  it('recusa data no futuro, data invalida e backup que falha (nada e alterado)', async () => {
    await importarTresOs()
    expect(() => migracaoService.encerrarOsAntigasAbertas('2999-01-01')).toThrow(/futuro/)
    expect(() => migracaoService.encerrarOsAntigasAbertas('2024-02-30')).toThrow(/data válida/)
    backup.lanca = true
    expect(() => migracaoService.encerrarOsAntigasAbertas('2024-06-30')).toThrow(/backup/)
    expect(situacoes().some((o) => o.situacao !== 'ENTREGUE')).toBe(true)
  })

  it('sem OS antiga em aberto, avisa em vez de fingir', async () => {
    origem.clientes = []
    origem.exames = []
    expect(() => migracaoService.encerrarOsAntigasAbertas('2024-06-30')).toThrow(/Não há/)
  })
})

describe('registro em branco (so nome + exames sem nenhum dado)', () => {
  /** Exame totalmente em branco, como o "MDO-0" do sistema antigo. */
  const exameEmBranco = (id: number, idCliente: number): ExameOrigemRow => exame(id, idCliente, { armacao: null, data_exame: '2026-10-22' })
  const contagem = (tabela: string): number => (banco.db!.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get() as { n: number }).n

  it('nao importa o cliente nem o exame em branco, e conta', async () => {
    origem.clientes = [cliente(1, 'EMANUELLE'), cliente(2, 'ANA', { celular: '(85) 98888-7777' })]
    origem.exames = [exameEmBranco(0, 1), exame(10, 2)]

    const r = await importar()

    expect(r.registrosVaziosIgnorados).toBe(1)
    expect(nomesNoBanco()).toEqual(['ANA'])
    expect(contagem('receita_optica')).toBe(1)
    expect(contagem('ordem_servico')).toBe(1)
    expect(pendencias()).toEqual([]) // e uma regra, nao um problema a resolver
  })

  it('cliente com qualquer dado de contato fica, mesmo com exame em branco', async () => {
    origem.clientes = [cliente(1, 'EMANUELLE', { celular: '(85) 98888-7777' })]
    origem.exames = [exameEmBranco(0, 1)]
    const r = await importar()
    expect(r.registrosVaziosIgnorados).toBe(0)
    expect(nomesNoBanco()).toEqual(['EMANUELLE'])
  })

  it('cliente com um exame que tem conteudo fica, mesmo sem dados de contato', async () => {
    origem.clientes = [cliente(1, 'EMANUELLE')]
    origem.exames = [exameEmBranco(0, 1), exame(10, 1)]
    const r = await importar()
    expect(r.registrosVaziosIgnorados).toBe(0)
    expect(nomesNoBanco()).toEqual(['EMANUELLE'])
  })

  it('exame com so o valor preenchido ja nao e em branco', async () => {
    origem.clientes = [cliente(1, 'EMANUELLE')]
    origem.exames = [exame(10, 1, { armacao: null, valor_oculos: '50.00' })]
    expect((await importar()).registrosVaziosIgnorados).toBe(0)
  })

  it('sem a aprovacao, importa como antes', async () => {
    origem.clientes = [cliente(1, 'EMANUELLE')]
    origem.exames = [exameEmBranco(0, 1)]
    const r = await importar({ ...APROVA_TUDO, removerRegistrosVazios: false })
    expect(r.registrosVaziosIgnorados).toBe(0)
    expect(nomesNoBanco()).toEqual(['EMANUELLE'])
  })

  it('remove o que ja tinha sido importado em branco, com tudo o que a importacao criou', async () => {
    origem.clientes = [cliente(1, 'EMANUELLE'), cliente(2, 'ANA', { celular: '(85) 98888-7777' })]
    origem.exames = [exameEmBranco(0, 1), exame(10, 2)]
    await importar({ ...APROVA_TUDO, removerRegistrosVazios: false }) // como se tivesse entrado antes da regra
    expect(nomesNoBanco()).toEqual(['EMANUELLE', 'ANA'])

    const r = await importar()

    expect(r.registrosVaziosRemovidos).toBe(1)
    expect(nomesNoBanco()).toEqual(['ANA'])
    expect(contagem('receita_optica')).toBe(1)
    expect(contagem('venda')).toBe(1)
    expect(contagem('ordem_servico')).toBe(1)
    expect((banco.db!.prepare("SELECT COUNT(*) AS n FROM migracao_registro WHERE origem_id = 0").get() as { n: number }).n).toBe(0)
    const aud = banco.db!.prepare("SELECT valor_anterior FROM auditoria WHERE acao = 'REMOVER_REGISTROS_VAZIOS'").get() as { valor_anterior: string }
    expect(JSON.parse(aud.valor_anterior).removidos[0]).toMatchObject({ nome: 'EMANUELLE', exames: [0] })

    // Rodar de novo nao recria nem remove mais nada.
    const outra = await importar()
    expect(outra.registrosVaziosRemovidos).toBe(0)
    expect(nomesNoBanco()).toEqual(['ANA'])
  })

  it('se alguem ja mexeu no cliente importado, ele nao e removido', async () => {
    origem.clientes = [cliente(1, 'EMANUELLE')]
    origem.exames = [exameEmBranco(0, 1)]
    await importar({ ...APROVA_TUDO, removerRegistrosVazios: false })
    banco.db!.prepare("UPDATE cliente SET celular = '85988887777'").run()

    const r = await importar()

    expect(r.registrosVaziosRemovidos).toBe(0)
    expect(nomesNoBanco()).toEqual(['EMANUELLE'])
  })

  it('se a receita foi editada ou a venda ganhou valor, o cliente fica', async () => {
    origem.clientes = [cliente(1, 'EMANUELLE'), cliente(2, 'BETO')]
    origem.exames = [exameEmBranco(0, 1), exameEmBranco(1, 2)]
    await importar({ ...APROVA_TUDO, removerRegistrosVazios: false })
    banco.db!.prepare("UPDATE receita_optica SET longe_od_esf = 1.5 WHERE cliente_id = 1").run()
    banco.db!.prepare("UPDATE venda SET total_centavos = 5000 WHERE cliente_id = 2").run()

    const r = await importar()

    expect(r.registrosVaziosRemovidos).toBe(0)
    expect(nomesNoBanco()).toEqual(['EMANUELLE', 'BETO'])
  })

  it('a analise mostra o registro em branco sem gravar nada', async () => {
    origem.clientes = [cliente(1, 'EMANUELLE')]
    origem.exames = [exameEmBranco(0, 1)]

    const a = await migracaoService.analisar(CONFIG)

    expect(a.registrosVazios).toBe(1)
    expect(a.porTipo.REGISTRO_VAZIO).toBe(1)
    expect(a.pendencias[0].motivo).toContain('registro em branco')
    expect(contagem('cliente')).toBe(0)
  })
})

describe('migracaoPendenciaService - reabrir', () => {
  const abertas = () => migracaoPendenciaService.resumo('ABERTA')

  it('uma pendencia ignorada volta para aberta, limpando quem e quando a tratou', async () => {
    origem.clientes = [cliente(1, 'ANA', { cpf: '123.456.789-00' })]
    origem.exames = []
    await importar()
    const p = pendencias()[0]
    migracaoPendenciaService.ignorar(p.id)
    expect(abertas()).toEqual({})

    migracaoPendenciaService.reabrir(p.id)

    expect(abertas()).toEqual({ CPF_INVALIDO: 1 })
    const linha = banco.db!.prepare('SELECT status, resolvido_em, resolvido_por FROM migracao_pendencia WHERE id = :id').get({ id: p.id }) as {
      status: string
      resolvido_em: string | null
      resolvido_por: number | null
    }
    expect(linha).toEqual({ status: 'ABERTA', resolvido_em: null, resolvido_por: null })
    const aud = banco.db!.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE acao = 'REABRIR_PENDENCIA_IMPORTACAO'").get() as { n: number }
    expect(aud.n).toBe(1)
  })

  it('tambem reabre uma resolvida; reimportar nao muda o que voltou a ficar aberto', async () => {
    origem.clientes = [cliente(1, 'ANA', { cpf: '123.456.789-00' })]
    origem.exames = []
    await importar()
    const p = pendencias()[0]
    migracaoPendenciaService.resolver(p.id)
    migracaoPendenciaService.reabrir(p.id)

    await importar()

    expect(abertas()).toEqual({ CPF_INVALIDO: 1 })
    expect(pendencias()).toHaveLength(1)
  })

  it('recusa reabrir o que ja esta aberto', async () => {
    origem.clientes = [cliente(1, 'ANA', { cpf: '123.456.789-00' })]
    origem.exames = []
    await importar()
    expect(() => migracaoPendenciaService.reabrir(pendencias()[0].id)).toThrow(/já está aberta/)
  })
})
