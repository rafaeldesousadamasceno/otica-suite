import { type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation } from '@tanstack/react-query'
import { Download, FileText, Loader2, Maximize2, Minus, Plus, Printer, X } from 'lucide-react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import { Button } from '@renderer/components/ui/Button'
import { useElementWidth } from '@renderer/components/charts/chartUtils'
import { carregarPdfjs } from '@renderer/lib/pdfjs'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { toast } from '@renderer/state/toastStore'
import { usePdfViewerStore } from '@renderer/state/pdfViewerStore'
import type { PdfVisualizacao } from '@shared/types'

interface TamanhoPagina {
  largura: number
  altura: number
}

/** Degraus do zoom, como num leitor de PDF comum. */
const DEGRAUS_ZOOM = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]
/** Folga lateral da area cinza quando o zoom e "ajustar a largura". */
const FOLGA_LARGURA = 48
/** Limites do zoom, tanto pelos botoes quanto pela roda do mouse. */
const ESCALA_MINIMA = 0.25
const ESCALA_MAXIMA = 4

function mensagemDeErro(err: unknown): string {
  return err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.'
}

/**
 * Visualizador de PDF do sistema. Fica montado uma vez no AppShell e abre
 * quando alguma tela gera um relatorio (`useGerarPdf`). Dali a pessoa salva
 * ou manda direto para a impressora.
 */
export function PdfViewer(): ReactNode {
  const atual = usePdfViewerStore((s) => s.atual)
  if (!atual) return null
  // `key`: cada PDF novo comeca do zero (zoom, pagina, documento carregado).
  return createPortal(<PdfViewerAberto key={atual.id} pdf={atual} />, document.body)
}

function PdfViewerAberto({ pdf }: { pdf: PdfVisualizacao }): ReactNode {
  const fechar = usePdfViewerStore((s) => s.fechar)
  const [documento, setDocumento] = useState<PDFDocumentProxy | null>(null)
  const [tamanhos, setTamanhos] = useState<TamanhoPagina[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [zoom, setZoom] = useState<number | 'largura'>('largura')
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [areaRef, larguraArea] = useElementWidth<HTMLDivElement>()
  const painelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelado = false
    let tarefa: PDFDocumentLoadingTask | null = null
    carregarPdfjs()
      .then(async (pdfjs) => {
        if (cancelado) return
        // Copia: o pdf.js entrega o buffer ao worker, e o original continua no store.
        tarefa = pdfjs.getDocument({ data: pdf.bytes.slice() })
        const carregado = await tarefa.promise
        if (cancelado) return
        const lidos: TamanhoPagina[] = []
        for (let n = 1; n <= carregado.numPages; n++) {
          const viewport = (await carregado.getPage(n)).getViewport({ scale: 1 })
          lidos.push({ largura: viewport.width, altura: viewport.height })
        }
        if (cancelado) return
        setDocumento(carregado)
        setTamanhos(lidos)
      })
      .catch((err) => {
        if (!cancelado) setErro(`Não foi possível mostrar o PDF (${mensagemDeErro(err)}). Ainda dá para salvar ou imprimir.`)
      })
    return () => {
      cancelado = true
      // Encerra o documento e o worker deste PDF.
      void tarefa?.destroy()
    }
  }, [pdf])

  const larguraMaxima = useMemo(() => Math.max(0, ...tamanhos.map((t) => t.largura)), [tamanhos])
  const escalaLargura = larguraMaxima > 0 && larguraArea > 0 ? (larguraArea - FOLGA_LARGURA) / larguraMaxima : 1
  const escala = Math.min(ESCALA_MAXIMA, Math.max(ESCALA_MINIMA, zoom === 'largura' ? escalaLargura : zoom))

  // Zoom pela roda do mouse (Ctrl + roda, e o gesto de pinca do touchpad, que chega como Ctrl + roda).
  // A roda sozinha continua rolando as paginas. O zoom fica ancorado no ponteiro: o que esta embaixo
  // dele continua embaixo dele, como nos leitores de PDF comuns.
  const escalaRef = useRef(escala)
  escalaRef.current = escala
  const ancoraRef = useRef<{ x: number; y: number; antes: number } | null>(null)

  useEffect(() => {
    const area = areaRef.current
    if (!area) return
    let fator = 1
    let quadro = 0
    let alvo = { x: 0, y: 0 }

    // Um evento por quadro: a roda dispara muitos eventos seguidos e cada zoom redesenha as paginas.
    const aplicar = (): void => {
      quadro = 0
      const antes = escalaRef.current
      const depois = Math.min(ESCALA_MAXIMA, Math.max(ESCALA_MINIMA, antes * fator))
      fator = 1
      if (Math.abs(depois - antes) < 0.0005) return
      ancoraRef.current = { x: alvo.x, y: alvo.y, antes }
      setZoom(depois)
    }
    const onWheel = (e: WheelEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return // rolagem comum: deixa rolar
      e.preventDefault() // senao o Chromium aplicaria o zoom dele na janela inteira
      const caixa = area.getBoundingClientRect()
      alvo = { x: e.clientX - caixa.left, y: e.clientY - caixa.top }
      fator *= Math.exp(-Math.max(-120, Math.min(120, e.deltaY)) * 0.002)
      if (!quadro) quadro = requestAnimationFrame(aplicar)
    }

    area.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      area.removeEventListener('wheel', onWheel)
      if (quadro) cancelAnimationFrame(quadro)
    }
  }, [areaRef])

  // Depois que o zoom muda o tamanho das paginas, ajusta a rolagem para manter o ponto sob o ponteiro.
  useLayoutEffect(() => {
    const ancora = ancoraRef.current
    const area = areaRef.current
    if (!ancora || !area) return
    ancoraRef.current = null
    const razao = escala / ancora.antes
    area.scrollLeft = (area.scrollLeft + ancora.x) * razao - ancora.x
    area.scrollTop = (area.scrollTop + ancora.y) * razao - ancora.y
  }, [escala, areaRef])

  const zoomMais = useCallback(() => setZoom(DEGRAUS_ZOOM.find((d) => d > escala + 0.001) ?? DEGRAUS_ZOOM.at(-1)!), [escala])
  const zoomMenos = useCallback(
    () => setZoom([...DEGRAUS_ZOOM].reverse().find((d) => d < escala - 0.001) ?? DEGRAUS_ZOOM[0]),
    [escala]
  )

  const salvar = useMutation({
    mutationFn: () => unwrap(window.api.pdf.salvar({ id: pdf.id })),
    onSuccess: (resultado) => {
      if (resultado) toast.ok(`PDF salvo em ${resultado.caminho}`)
    },
    onError: (err) => toast.error(mensagemDeErro(err))
  })

  const imprimir = useMutation({
    mutationFn: () => unwrap(window.api.pdf.imprimir({ id: pdf.id })),
    onSuccess: (resultado) => {
      if (resultado.impresso) toast.ok('Documento enviado para a impressora.')
    },
    onError: (err) => toast.error(mensagemDeErro(err))
  })

  // Atalhos. Fase de captura: o Esc fecha so o visualizador, e nao tambem o
  // dialogo que estiver por baixo (ex.: detalhe da venda).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const ctrl = e.ctrlKey || e.metaKey
      let tratado = true
      if (e.key === 'Escape') fechar()
      else if (ctrl && e.key.toLowerCase() === 's') {
        if (!salvar.isPending) salvar.mutate()
      } else if (ctrl && e.key.toLowerCase() === 'p') {
        if (!imprimir.isPending) imprimir.mutate()
      } else if (ctrl && (e.key === '+' || e.key === '=')) zoomMais()
      else if (ctrl && e.key === '-') zoomMenos()
      else if (ctrl && e.key === '0') setZoom('largura')
      else tratado = false

      if (tratado) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [fechar, salvar, imprimir, zoomMais, zoomMenos])

  useEffect(() => {
    painelRef.current?.focus()
  }, [])

  function atualizarPaginaAtual(): void {
    const area = areaRef.current
    if (!area) return
    const meio = area.scrollTop + area.clientHeight / 3
    let atual = 1
    for (const el of area.querySelectorAll<HTMLElement>('[data-pagina]')) {
      if (el.offsetTop <= meio) atual = Number(el.dataset.pagina)
    }
    setPaginaAtual(atual)
  }

  return (
    <div
      ref={painelRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Visualizar ${pdf.titulo}`}
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--surface)] outline-none"
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--rule)] px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <FileText className="size-5 shrink-0 text-[var(--accent)]" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--ink)]">{pdf.titulo}</p>
            <p className="truncate text-xs text-[var(--ink-3)]">{pdf.nomeArquivo}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-sm text-[var(--ink-2)]">
          {tamanhos.length > 0 && (
            <span className="mr-3 tabular-nums" aria-live="polite">
              Página {paginaAtual} de {tamanhos.length}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={zoomMenos} aria-label="Diminuir zoom" title="Diminuir zoom (Ctrl -)">
            <Minus className="size-4" />
          </Button>
          <span className="w-12 text-center tabular-nums" title="Ctrl + roda do mouse: aproximar ou afastar">
            {Math.round(escala * 100)}%
          </span>
          <Button variant="ghost" size="sm" onClick={zoomMais} aria-label="Aumentar zoom" title="Aumentar zoom (Ctrl +)">
            <Plus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setZoom('largura')}
            aria-label="Ajustar à largura"
            title="Ajustar à largura (Ctrl 0)"
            className={zoom === 'largura' ? 'text-[var(--accent)]' : undefined}
          >
            <Maximize2 className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" loading={salvar.isPending} onClick={() => salvar.mutate()} title="Salvar (Ctrl S)">
            {!salvar.isPending && <Download className="size-4" />} Salvar
          </Button>
          <Button size="sm" loading={imprimir.isPending} onClick={() => imprimir.mutate()} title="Imprimir (Ctrl P)">
            {!imprimir.isPending && <Printer className="size-4" />} Imprimir
          </Button>
          <Button variant="ghost" size="sm" onClick={fechar} aria-label="Fechar" title="Fechar (Esc)">
            <X className="size-4" />
          </Button>
        </div>
      </header>

      <div
        ref={areaRef}
        onScroll={atualizarPaginaAtual}
        className="flex-1 overflow-auto bg-[var(--pdf-fundo)]"
      >
        {erro ? (
          <p className="mx-auto mt-16 max-w-md rounded-md bg-[var(--surface)] p-4 text-center text-sm text-[var(--danger)]">
            {erro}
          </p>
        ) : !documento ? (
          <div className="mt-24 flex items-center justify-center gap-2 text-sm text-white/80">
            <Loader2 className="size-4 animate-spin" /> Abrindo PDF…
          </div>
        ) : (
          <div className="flex min-w-fit flex-col items-center gap-4 px-6 py-6">
            {tamanhos.map((tamanho, i) => (
              <PaginaPdf
                key={i}
                documento={documento}
                numero={i + 1}
                escala={escala}
                tamanho={tamanho}
                raiz={areaRef}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Uma pagina. So desenha quando chega perto da area visivel, e cada novo
 * desenho (zoom) vai para um canvas novo que so entra no lugar quando fica
 * pronto - sem piscar e sem dois desenhos no mesmo canvas.
 */
function PaginaPdf({
  documento,
  numero,
  escala,
  tamanho,
  raiz
}: {
  documento: PDFDocumentProxy
  numero: number
  escala: number
  tamanho: TamanhoPagina
  raiz: RefObject<HTMLDivElement | null>
}): ReactNode {
  const caixaRef = useRef<HTMLDivElement>(null)
  const [visivel, setVisivel] = useState(numero <= 2)

  useEffect(() => {
    if (visivel || !caixaRef.current) return
    const observer = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) setVisivel(true)
      },
      { root: raiz.current, rootMargin: '800px 0px' }
    )
    observer.observe(caixaRef.current)
    return () => observer.disconnect()
  }, [visivel, raiz])

  useEffect(() => {
    if (!visivel) return
    let cancelado = false
    let tarefa: { cancel: () => void } | null = null

    void documento.getPage(numero).then((pagina) => {
      if (cancelado) return
      const viewport = pagina.getViewport({ scale: escala })
      const dpr = window.devicePixelRatio || 1
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      canvas.setAttribute('aria-hidden', 'true')

      const render = pagina.render({ canvas, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined })
      tarefa = render
      render.promise
        .then(() => {
          if (!cancelado) caixaRef.current?.replaceChildren(canvas)
        })
        .catch(() => undefined) // cancelado por um zoom novo
    })

    return () => {
      cancelado = true
      tarefa?.cancel()
    }
  }, [documento, numero, escala, visivel])

  return (
    <div
      ref={caixaRef}
      data-pagina={numero}
      role="img"
      aria-label={`Página ${numero}`}
      className="shrink-0 bg-white shadow-lg"
      style={{ width: Math.floor(tamanho.largura * escala), height: Math.floor(tamanho.altura * escala) }}
    />
  )
}
