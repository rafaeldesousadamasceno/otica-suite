import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AlertTriangle, FileDown, Lightbulb, Search } from 'lucide-react'
import { Button } from '@renderer/components/ui/Button'
import { Card, CardBody } from '@renderer/components/ui/Card'
import { Input } from '@renderer/components/ui/Input'
import { useGerarPdf } from '@renderer/lib/useGerarPdf'
import { useAuthStore } from '@renderer/state/authStore'
import { buscarSecoes, secoesDoPerfil, type BlocoAjuda, type SecaoAjuda } from '@shared/ajuda'

function Bloco({ bloco }: { bloco: BlocoAjuda }): ReactNode {
  switch (bloco.tipo) {
    case 'paragrafo':
      return <p className="text-sm leading-relaxed text-[var(--ink-2)]">{bloco.texto}</p>
    case 'passos':
      return (
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-[var(--ink-2)] marker:font-semibold marker:text-[var(--accent)]">
          {bloco.itens.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      )
    case 'lista':
      return (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-[var(--ink-2)] marker:text-[var(--accent)]">
          {bloco.itens.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )
    case 'dica':
    case 'atencao': {
      const atencao = bloco.tipo === 'atencao'
      const Icone = atencao ? AlertTriangle : Lightbulb
      return (
        <div
          className={`flex gap-3 rounded-md border-l-4 p-3 text-sm ${
            atencao ? 'border-[var(--warn)] bg-[var(--warn-wash)]' : 'border-[var(--accent)] bg-[var(--accent)]/8'
          }`}
        >
          <Icone className={`mt-0.5 size-4 shrink-0 ${atencao ? 'text-[var(--warn)]' : 'text-[var(--accent)]'}`} aria-hidden />
          <div className="text-[var(--ink-2)]">
            <span className="sr-only">{atencao ? 'Atenção: ' : 'Dica: '}</span>
            {bloco.titulo && <p className="font-semibold text-[var(--ink)]">{bloco.titulo}</p>}
            <p className="leading-relaxed">{bloco.texto}</p>
          </div>
        </div>
      )
    }
    case 'tabela':
      return (
        <div className="overflow-x-auto rounded-md border border-[var(--rule)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-2)]">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                {bloco.colunas.map((c) => (
                  <th key={c} className="px-3 py-2">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bloco.linhas.map((linha) => (
                <tr key={linha[0]} className="border-t border-[var(--rule)] align-top">
                  {linha.map((celula, i) => (
                    <td key={i} className={`px-3 py-2 ${i === 0 ? 'font-medium text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}>
                      {celula}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

function SecaoView({ secao }: { secao: SecaoAjuda }): ReactNode {
  return (
    <Card id={secao.id} className="scroll-mt-4">
      <CardBody className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">{secao.titulo}</h2>
          <p className="text-sm text-[var(--ink-3)]">{secao.resumo}</p>
        </div>
        {secao.blocos.map((bloco, i) => (
          <Bloco key={i} bloco={bloco} />
        ))}
      </CardBody>
    </Card>
  )
}

/**
 * Ajuda dentro do sistema: sumario, busca (sem acento) e o manual completo do
 * perfil. O botao "?" da barra superior abre a secao da tela em que a pessoa
 * estava (`/ajuda#clientes`). O mesmo conteudo vira o PDF do manual.
 */
export function AjudaPage(): ReactNode {
  const perfil = useAuthStore((s) => s.sessao?.usuario.perfil ?? 'vendedor')
  const { hash } = useLocation()
  const [termo, setTermo] = useState('')

  const secoes = useMemo(() => secoesDoPerfil(perfil), [perfil])
  const encontradas = useMemo(() => buscarSecoes(secoes, termo), [secoes, termo])
  const manual = useGerarPdf(() => window.api.relatorios.manual())

  // Vindo do "?" de outra tela: rola ate a secao pedida.
  useEffect(() => {
    const id = decodeURIComponent(hash.replace(/^#/, ''))
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }, [hash])

  function irPara(id: string): void {
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--ink)]">Ajuda</h1>
          <p className="text-sm text-[var(--ink-3)]">Como usar cada tela do sistema.</p>
        </div>
        <Button variant="secondary" loading={manual.isPending} onClick={() => manual.mutate()}>
          <FileDown className="size-4" /> Manual em PDF
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-3)]" />
        <Input
          type="search"
          className="pl-9"
          placeholder="Buscar na ajuda (ex.: desconto, backup, receita)…"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          aria-label="Buscar na ajuda"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Sumário da ajuda" className="lg:sticky lg:top-0 lg:max-h-[calc(100vh-10rem)] lg:self-start lg:overflow-y-auto">
          <ul className="flex flex-col gap-0.5 rounded-lg border border-[var(--rule)] bg-[var(--surface)] p-2">
            {encontradas.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => irPara(s.id)}
                  className="w-full rounded-md px-3 py-1.5 text-left text-sm text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                >
                  {s.titulo}
                </button>
              </li>
            ))}
            {encontradas.length === 0 && <li className="px-3 py-2 text-sm text-[var(--ink-3)]">Nada encontrado.</li>}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-4">
          {encontradas.length === 0 ? (
            <Card>
              <CardBody className="text-sm text-[var(--ink-3)]">
                Nenhuma seção fala de "{termo}". Tente outra palavra, como o nome da tela ou da ação.
              </CardBody>
            </Card>
          ) : (
            encontradas.map((s) => <SecaoView key={s.id} secao={s} />)
          )}
        </div>
      </div>
    </div>
  )
}
