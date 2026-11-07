import { describe, expect, it } from 'vitest'
import { svgBarrasH, svgColunas, svgLinha, svgPareto, svgRosca } from './svgCharts'

const reais = (v: number): string => `R$ ${v / 100}`

function semNumeroInvalido(svg: string): void {
  expect(svg).not.toMatch(/NaN|Infinity|undefined/)
}

describe('svgColunas', () => {
  it('uma barra por valor positivo, com legenda quando ha duas series', () => {
    const svg = svgColunas({
      categorias: ['01/10', '02/10', '03/10'],
      series: [
        { nome: 'Receitas', cor: '#2a78d6', valores: [100, 0, 300] },
        { nome: 'Despesas', cor: '#eb6834', valores: [50, 20, 0] }
      ],
      formatarEixo: reais,
      largura: 600,
      descricao: 'teste'
    })
    expect(svg.match(/<path /g)).toHaveLength(4)
    expect(svg).toContain('class="legenda"')
    semNumeroInvalido(svg)
  })

  it('sem dados mostra o aviso em vez de um grafico vazio', () => {
    const svg = svgColunas({
      categorias: ['a'],
      series: [{ nome: 'x', cor: '#000', valores: [0] }],
      formatarEixo: reais,
      largura: 600,
      descricao: 't'
    })
    expect(svg).toContain('Sem dados no período.')
  })
})

describe('svgLinha', () => {
  it('aceita valores negativos e rotula o ultimo ponto', () => {
    const svg = svgLinha({
      pontos: [
        { rotulo: 'a', valor: 1000 },
        { rotulo: 'b', valor: -5000 },
        { rotulo: 'c', valor: 2500 }
      ],
      cor: '#2a78d6',
      formatarEixo: reais,
      formatarValor: reais,
      largura: 600,
      descricao: 'saldo'
    })
    expect(svg).toContain('R$ 25')
    // O eixo desce abaixo de zero para caber o saldo negativo.
    expect(svg).toMatch(/R\$ -\d+/)
    semNumeroInvalido(svg)
  })
})

describe('svgBarrasH', () => {
  it('escapa os rotulos e ignora itens zerados', () => {
    const svg = svgBarrasH({
      itens: [
        { rotulo: 'Ana <b>', valor: 100 },
        { rotulo: 'Zeca', valor: 0 }
      ],
      formatarValor: reais,
      largura: 500,
      descricao: 'ranking'
    })
    expect(svg).toContain('Ana &lt;b&gt;')
    expect(svg).not.toContain('Zeca')
    semNumeroInvalido(svg)
  })
})

describe('svgPareto', () => {
  it('uma barra por produto, linha do acumulado e referencias de 80% e 95%', () => {
    const svg = svgPareto({
      itens: [
        { rotulo: '1', participacao: 60, acumulado: 60, classe: 'A' },
        { rotulo: '2', participacao: 30, acumulado: 90, classe: 'B' },
        { rotulo: '3', participacao: 10, acumulado: 100, classe: 'C' }
      ],
      largura: 600,
      descricao: 'abc'
    })
    expect(svg.match(/stroke-dasharray/g)).toHaveLength(2)
    expect(svg.match(/<circle /g)).toHaveLength(3)
    semNumeroInvalido(svg)
  })
})

describe('svgRosca', () => {
  it('uma fatia so (100%) ainda desenha o anel inteiro', () => {
    const html = svgRosca({
      fatias: [{ rotulo: 'Lentes', valor: 500, cor: '#eb6834' }],
      formatarValor: reais,
      centro: { valor: 'R$ 5', rotulo: 'total' },
      descricao: 'rosca'
    })
    expect(html).toContain('100%')
    expect(html.match(/<path /g)).toHaveLength(1)
    semNumeroInvalido(html)
  })

  it('fatias com o percentual de cada uma', () => {
    const html = svgRosca({
      fatias: [
        { rotulo: 'A', valor: 300, cor: '#2a78d6' },
        { rotulo: 'B', valor: 100, cor: '#eb6834' }
      ],
      formatarValor: reais,
      centro: { valor: 'R$ 4', rotulo: 'total' },
      descricao: 'rosca'
    })
    expect(html).toContain('75%')
    expect(html).toContain('25%')
  })
})
