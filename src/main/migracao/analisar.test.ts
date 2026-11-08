import { describe, expect, it } from 'vitest'
import {
  analisarDatasExame,
  calcularAnosVizinhos,
  clienteSemDadosDeContato,
  dataValidaOuNull,
  exameSemConteudo,
  identificarRegistrosVazios,
  mesmaPessoa,
  planejarClientes
} from './analisar'

const HOJE = '2026-11-07'
const SEM_DATAS = { data_exame: null, data_venda: null, data_saida: null, data_chegada: null }

describe('dataValidaOuNull', () => {
  it('aceita so o dia e descarta o horario', () => {
    expect(dataValidaOuNull('2024-03-10 14:30:00')).toBe('2024-03-10')
  })
  it('descarta data que nao existe, zerada, de ano absurdo ou de formato estranho', () => {
    for (const v of ['0000-00-00', '2024-02-30', '0202-05-01', '1899-01-01', '10/03/2024', 'abc', '', null]) {
      expect(dataValidaOuNull(v as string | null)).toBeNull()
    }
  })
})

describe('mesmaPessoa', () => {
  it('ignora acento, maiuscula e espacos repetidos', () => {
    expect(mesmaPessoa({ nome: 'Príscila  Alves', dataNasc: null }, { nome: 'PRISCILA ALVES', dataNasc: null })).toBe(true)
  })
  it('nascimentos diferentes sao pessoas diferentes; um ausente nao impede', () => {
    expect(mesmaPessoa({ nome: 'ANA', dataNasc: '1990-01-01' }, { nome: 'ANA', dataNasc: '1991-01-01' })).toBe(false)
    expect(mesmaPessoa({ nome: 'ANA', dataNasc: '1990-01-01' }, { nome: 'ANA', dataNasc: null })).toBe(true)
  })
  it('nome vazio nunca e a mesma pessoa', () => {
    expect(mesmaPessoa({ nome: '', dataNasc: null }, { nome: '', dataNasc: null })).toBe(false)
  })
})

describe('analisarDatasExame', () => {
  it('o caso do ano errado: exame em 2026, venda e chegada em 2025 -> sugere 2025', () => {
    const { pendencias } = analisarDatasExame(
      1,
      { ...SEM_DATAS, data_exame: '2026-10-22', data_venda: '2025-11-03', data_chegada: '2025-11-20' },
      HOJE
    )
    const p = pendencias.find((x) => x.tipo === 'DATA_INCOERENTE')!
    expect(p.dados).toMatchObject({ campo: 'data_exame', atual: '2026-10-22', sugerido: '2025-10-22' })
    expect(p.dados?.base).toContain('2025')
    expect(p.sugestao).toContain('22/10/2025')
  })

  it('data no futuro tambem e alertada', () => {
    const { pendencias } = analisarDatasExame(1, { ...SEM_DATAS, data_exame: '2027-01-10', data_venda: '2027-01-10' }, HOJE)
    expect(pendencias.some((p) => p.tipo === 'DATA_INCOERENTE' && p.motivo.includes('no futuro'))).toBe(true)
  })

  it('intervalo longo demais entre exame e entrega e alertado', () => {
    const { pendencias } = analisarDatasExame(1, { ...SEM_DATAS, data_exame: '2020-01-10', data_chegada: '2024-01-10' }, HOJE)
    expect(pendencias[0].motivo).toContain('dias entre')
  })

  it('quando duas correcoes servem igualmente, nao chuta', () => {
    // exame depois da venda: tanto atrasar a venda quanto adiantar o exame em 1 ano resolvem.
    const { pendencias } = analisarDatasExame(1, { ...SEM_DATAS, data_exame: '2025-06-10', data_venda: '2025-06-01' }, HOJE)
    const p = pendencias.find((x) => x.tipo === 'DATA_INCOERENTE')!
    expect(p.dados?.sugerido).toBeUndefined()
    expect(p.sugestao).toContain('Confira')
  })

  it('datas em ordem nao geram nada e vem saneadas', () => {
    const r = analisarDatasExame(
      1,
      { data_exame: '2024-02-01 00:00:00', data_venda: '2024-02-10', data_saida: '2024-02-11', data_chegada: '2024-02-20' },
      HOJE
    )
    expect(r.pendencias).toEqual([])
    expect(r.datas.data_exame).toBe('2024-02-01')
  })

  it('sem data de exame: avisa que foi usada outra', () => {
    const { pendencias } = analisarDatasExame(1, { ...SEM_DATAS, data_venda: '2024-02-10' }, HOJE)
    expect(pendencias[0]).toMatchObject({ tipo: 'DATA_AUSENTE' })
    expect(pendencias[0].motivo).toContain('data da venda')
  })
})

describe('planejarClientes', () => {
  const base = { examesPorCliente: new Map<number, number>(), existentes: [], aprovacoes: { mesclarDuplicados: true, removerCpfConflitante: true, removerRegistrosVazios: true } }
  const cli = (id: number, nome: string, cpf: string | null) => ({ idOrigem: id, nome, dataNasc: null, cpfBruto: cpf })

  it('o cadastro com mais exames e o principal; os demais se unem a ele', () => {
    const plano = planejarClientes({
      ...base,
      clientes: [cli(1, 'ANA', '529.982.247-25'), cli(2, 'ANA', '529.982.247-25')],
      examesPorCliente: new Map([[2, 5]])
    })
    expect(plano.get(2)).toMatchObject({ acao: 'IMPORTAR', cpf: '52998224725' })
    expect(plano.get(1)).toMatchObject({ acao: 'MESCLAR', comOrigemId: 2 })
  })

  it('tres com o mesmo CPF: dois sao a mesma pessoa, o terceiro e outra', () => {
    const plano = planejarClientes({
      ...base,
      clientes: [cli(1, 'ANA', '529.982.247-25'), cli(2, 'Ana', '52998224725'), cli(3, 'BETO', '529.982.247-25')]
    })
    expect(plano.get(1)).toMatchObject({ acao: 'IMPORTAR', cpf: '52998224725' })
    expect(plano.get(2)).toMatchObject({ acao: 'MESCLAR', comOrigemId: 1 })
    expect(plano.get(3)).toMatchObject({ acao: 'IMPORTAR', cpf: null })
  })

  it('sentinela e vazio nao entram na conta de CPF', () => {
    const plano = planejarClientes({ ...base, clientes: [cli(1, 'ANA', null), cli(2, 'BETO', null)] })
    expect([...plano.values()].every((p) => p.acao === 'IMPORTAR' && p.pendencias.length === 0)).toBe(true)
  })
})

describe('sugestao do ano por votacao', () => {
  it('sem outras datas no exame, vota o ano da maioria dos exames de codigo proximo', () => {
    const r = analisarDatasExame(1, { ...SEM_DATAS, data_exame: '2027-01-10' }, HOJE, { anosVizinhos: [2024, 2024, 2024, 2024, 2025, 2024] })
    const p = r.pendencias.find((x) => x.tipo === 'DATA_INCOERENTE')!
    expect(p.dados).toMatchObject({ campo: 'data_exame', atual: '2027-01-10', sugerido: '2024-01-10' })
    expect(p.dados?.base).toContain('5 dos 6')
  })

  it('os vizinhos so valem com maioria clara', () => {
    const r = analisarDatasExame(1, { ...SEM_DATAS, data_exame: '2027-01-10' }, HOJE, { anosVizinhos: [2024, 2025, 2024, 2025] })
    expect(r.pendencias.find((x) => x.tipo === 'DATA_INCOERENTE')!.dados?.sugerido).toBeUndefined()
  })

  it('as outras datas do proprio exame tem prioridade sobre os vizinhos', () => {
    const r = analisarDatasExame(
      1,
      { ...SEM_DATAS, data_exame: '2026-10-22', data_venda: '2025-11-03', data_chegada: '2025-11-20' },
      HOJE,
      { anosVizinhos: [2023, 2023, 2023, 2023] }
    )
    expect(r.pendencias.find((x) => x.tipo === 'DATA_INCOERENTE')!.dados?.sugerido).toBe('2025-10-22')
  })

  it('so sugere se a data nova deixa o exame em ordem', () => {
    // O exame em 2026-10-22 viraria 2025-10-22, mas o envio foi em 2025-01: continuaria fora de ordem.
    const r = analisarDatasExame(1, { ...SEM_DATAS, data_exame: '2026-10-22', data_venda: '2025-11-03', data_saida: '2025-01-05' }, HOJE)
    expect(r.pendencias.find((x) => x.tipo === 'DATA_INCOERENTE')!.dados?.sugerido).toBeUndefined()
  })
})

describe('data invalida ou ausente: ponto de partida pela data da venda', () => {
  it('exame com data que nao existe vira so DATA_INVALIDA, com a estimativa e o valor original', () => {
    const r = analisarDatasExame(1, { ...SEM_DATAS, data_exame: '2026-18-22', data_venda: '2025-11-03' }, HOJE)
    expect(r.pendencias.map((p) => p.tipo)).toEqual(['DATA_INVALIDA'])
    expect(r.pendencias[0].dados).toMatchObject({ origemExame: '2026-18-22', sugerido: '2025-11-03', estimativa: 'sim' })
    expect(r.pendencias[0].sugestao).toContain('palpite')
  })

  it('sem nenhuma outra data, nao ha o que estimar', () => {
    const r = analisarDatasExame(1, { ...SEM_DATAS }, HOJE)
    expect(r.pendencias[0].dados?.sugerido).toBeUndefined()
  })
})

describe('calcularAnosVizinhos', () => {
  it('pega os anos dos exames de codigo proximo, sem contar o proprio', () => {
    const exames = [
      { id_exame: 10, data_exame: '2024-01-01', data_venda: null },
      { id_exame: 11, data_exame: '2024-02-01', data_venda: null },
      { id_exame: 12, data_exame: '2027-03-01', data_venda: null },
      { id_exame: 13, data_exame: null, data_venda: '2024-04-01' },
      { id_exame: 14, data_exame: null, data_venda: null }
    ]
    const mapa = calcularAnosVizinhos(exames, 1)
    expect(mapa.get(12)).toEqual([2024, 2024])
    expect(mapa.get(10)).toEqual([2024])
    expect(mapa.get(14)).toEqual([2024])
  })
})

describe('registro em branco (funcoes puras)', () => {
  const nulos = [
    'plonge_od_esf', 'plonge_oe_esf', 'plonge_od_cil', 'plonge_oe_cil', 'plonge_od_eixo', 'plonge_oe_eixo', 'plonge_od_dnp',
    'plonge_oe_dnp', 'pperto_od_esf', 'pperto_oe_esf', 'pperto_od_cil', 'pperto_oe_cil', 'pperto_od_eixo', 'pperto_oe_eixo',
    'pperto_od_dnp', 'pperto_oe_dnp', 'adicao', 'lentes', 'tratamentos', 'armacao', 'observacao', 'valor_exame', 'valor_oculos',
    'forma_pgto', 'laboratorio', 'med_opto', 'data_saida', 'data_chegada', 'situacao', 'data_venda', 'data_exame'
  ]
  const exame = (extras: Record<string, unknown> = {}) =>
    ({ ...Object.fromEntries(nulos.map((k) => [k, null])), id_exame: 1, id_cliente: 1, ...extras }) as never
  const cliente = (extras: Record<string, unknown> = {}) =>
    ({ id_cliente: 1, nome: 'EMANUELLE', data_nasc: null, cpf: null, celular: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf: null, ...extras }) as never

  it('graus zerados ("0", "0.00", 0) contam como vazios', () => {
    expect(exameSemConteudo(exame({ plonge_od_esf: '0.00', plonge_od_eixo: 0, adicao: '0', valor_exame: '0.00', data_exame: '2026-10-22' }))).toBe(true)
  })

  it('qualquer conteudo tira o exame de "em branco"', () => {
    for (const extras of [
      { armacao: 'RAY BAN' }, { lentes: 'x' }, { observacao: 'obs' }, { laboratorio: 'LAB' }, { med_opto: 'DR' },
      { plonge_od_esf: '1.25' }, { valor_oculos: '10.00' }, { data_saida: '2024-01-01' }, { situacao: 'ENTREGUE' }
    ]) {
      expect(exameSemConteudo(exame(extras)), JSON.stringify(extras)).toBe(false)
    }
  })

  it('cliente so com o nome (e a sentinela de celular) nao tem dados de contato', () => {
    expect(clienteSemDadosDeContato(cliente({ celular: '(85)91234-1234', uf: 'CE' }))).toBe(true)
    expect(clienteSemDadosDeContato(cliente({ cpf: '123' }))).toBe(false)
    expect(clienteSemDadosDeContato(cliente({ bairro: 'CENTRO' }))).toBe(false)
  })

  it('so e registro em branco quem tem exames e todos sao vazios', () => {
    const c2 = cliente({ id_cliente: 2, nome: 'SEM EXAME' })
    const vazios = identificarRegistrosVazios([cliente(), c2], [exame({ id_exame: 0 }), exame({ id_exame: 5 })])
    expect([...vazios.entries()]).toEqual([[1, [0, 5]]])
    expect(identificarRegistrosVazios([cliente()], [exame({ id_exame: 0 }), exame({ id_exame: 5, armacao: 'X' })]).size).toBe(0)
  })
})
