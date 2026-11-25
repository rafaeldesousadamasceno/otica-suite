import { describe, expect, it } from 'vitest'
import { NAV_GRUPOS, NAV_ITEMS, NAV_RODAPE } from './navConfig'

const PERFIS = ['admin', 'vendedor'] as const

describe('menu lateral em grupos', () => {
  for (const perfil of PERFIS) {
    describe(perfil, () => {
      const todos = [...NAV_GRUPOS[perfil].flatMap((g) => g.itens), ...NAV_RODAPE[perfil]]

      it('nenhum grupo fica vazio', () => {
        for (const g of NAV_GRUPOS[perfil]) expect(g.itens.length, g.titulo ?? 'sem título').toBeGreaterThan(0)
      })

      it('cada tela aparece uma vez só no menu', () => {
        const caminhos = todos.map((i) => i.path)
        expect(new Set(caminhos).size).toBe(caminhos.length)
      })

      it('a lista plana (usada pela ajuda) traz exatamente as telas dos grupos e do rodapé', () => {
        expect(NAV_ITEMS[perfil].map((i) => i.path).sort()).toEqual(todos.map((i) => i.path).sort())
      })

      it('só o primeiro grupo pode ficar sem título (o Início)', () => {
        NAV_GRUPOS[perfil].forEach((g, i) => {
          if (i > 0) expect(g.titulo, `grupo ${i}`).toBeTruthy()
        })
      })
    })
  }

  it('o vendedor nunca vê uma tela que o administrador não tem', () => {
    const admin = new Set(NAV_ITEMS.admin.map((i) => i.path))
    for (const i of NAV_ITEMS.vendedor) expect(admin.has(i.path), i.path).toBe(true)
  })

  it('telas só de administração não aparecem para o vendedor', () => {
    const vendedor = new Set(NAV_ITEMS.vendedor.map((i) => i.path))
    for (const p of ['/usuarios', '/backup', '/licenca', '/auditoria', '/configuracoes', '/importar-dados', '/caixa']) {
      expect(vendedor.has(p), p).toBe(false)
    }
  })

  it('o administrador tem o grupo Administração, recolhível e com a Licença (que pede atenção)', () => {
    const adm = NAV_GRUPOS.admin.find((g) => g.titulo === 'Administração')
    expect(adm?.recolhivel).toBe(true)
    expect(adm?.icone, 'precisa de ícone para o menu recolhido').toBeDefined()
    expect(adm?.itens.some((i) => i.path === '/licenca' && i.alertaLicenca)).toBe(true)
    // Os demais grupos ficam sempre abertos.
    for (const g of NAV_GRUPOS.admin) if (g !== adm) expect(g.recolhivel ?? false).toBe(false)
  })

  it('Configurações e Ajuda ficam no rodapé do administrador; só a Ajuda no do vendedor', () => {
    expect(NAV_RODAPE.admin.map((i) => i.path)).toEqual(['/configuracoes', '/ajuda'])
    expect(NAV_RODAPE.vendedor.map((i) => i.path)).toEqual(['/ajuda'])
  })
})
