import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { NAV_GRUPOS } from './navConfig'
import { GrupoMenu } from './Sidebar'

const administracao = NAV_GRUPOS.admin.find((g) => g.titulo === 'Administração')!
const atendimento = NAV_GRUPOS.admin.find((g) => g.titulo === 'Atendimento')!

function html(grupo: typeof administracao, rota: string, licencaAlerta = false): string {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [rota] }, createElement(GrupoMenu, { grupo, licencaAlerta })))
}

describe('grupo Administração do menu', () => {
  it('começa fechado numa tela de fora do grupo', () => {
    const h = html(administracao, '/clientes')
    expect(h).toContain('aria-expanded="false"')
    expect(h).toContain('hidden=""')
  })

  it('abre sozinho quando a tela atual é uma das dele', () => {
    for (const rota of ['/usuarios', '/backup', '/licenca', '/pendencias-importacao']) {
      const h = html(administracao, rota)
      expect(h, rota).toContain('aria-expanded="true"')
      expect(h, rota).not.toContain('hidden=""')
    }
  })

  it('fechado, mostra o ponto de atenção da licença no título; aberto, o ponto fica no item', () => {
    const fechado = html(administracao, '/clientes', true)
    expect(fechado.match(/A licença precisa de atenção/g)?.length).toBe(2) // o do título + o do item (escondido)
    const aberto = html(administracao, '/licenca', true)
    expect(aberto.match(/A licença precisa de atenção/g)?.length).toBe(1) // só no item
  })

  it('sem alerta de licença nenhum ponto aparece', () => {
    expect(html(administracao, '/clientes', false)).not.toContain('A licença precisa de atenção')
  })
})

describe('grupos que não recolhem', () => {
  it('têm título fixo, sem botão, e as telas sempre visíveis', () => {
    const h = html(atendimento, '/vendas')
    expect(h).toContain('Atendimento')
    expect(h).not.toContain('aria-expanded')
    expect(h).not.toContain('hidden=""')
    expect(h).toContain('Vendas')
  })
})
