import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { produtoInputSchema, type ProdutoInput } from '@shared/ipc'
import { centavosParaTexto } from '@renderer/lib/dinheiro'
import { toast } from '@renderer/state/toastStore'
import type { CategoriaProduto, Produto } from '@shared/types'

interface FormState {
  codigo: string
  codigoBarras: string
  descricao: string
  categoria: CategoriaProduto
  marca: string
  modelo: string
  cor: string
  tamanho: string
  unidade: string
  custoTexto: string
  margemTexto: string
  precoVendaTexto: string
  estoqueMinimo: string
  lenteMaterial: string
  lenteIndice: string
  lenteTipo: string
  lenteGrauMin: string
  lenteGrauMax: string
}

const VAZIO: FormState = {
  codigo: '',
  codigoBarras: '',
  descricao: '',
  categoria: 'armacao',
  marca: '',
  modelo: '',
  cor: '',
  tamanho: '',
  unidade: 'UN',
  custoTexto: '',
  margemTexto: '',
  precoVendaTexto: '',
  estoqueMinimo: '0',
  lenteMaterial: '',
  lenteIndice: '',
  lenteTipo: '',
  lenteGrauMin: '',
  lenteGrauMax: ''
}

function produtoParaForm(p: Produto): FormState {
  return {
    codigo: p.codigo ?? '',
    codigoBarras: p.codigoBarras ?? '',
    descricao: p.descricao,
    categoria: p.categoria,
    marca: p.marca ?? '',
    modelo: p.modelo ?? '',
    cor: p.cor ?? '',
    tamanho: p.tamanho ?? '',
    unidade: p.unidade,
    custoTexto: p.custoCentavos !== null ? centavosParaTexto(p.custoCentavos) : '',
    margemTexto: p.margem !== null ? String(p.margem) : '',
    precoVendaTexto: centavosParaTexto(p.precoVendaCentavos),
    estoqueMinimo: String(p.estoqueMinimo),
    lenteMaterial: p.lenteMaterial ?? '',
    lenteIndice: p.lenteIndice !== null ? String(p.lenteIndice) : '',
    lenteTipo: p.lenteTipo ?? '',
    lenteGrauMin: p.lenteGrauMin !== null ? String(p.lenteGrauMin) : '',
    lenteGrauMax: p.lenteGrauMax !== null ? String(p.lenteGrauMax) : ''
  }
}

interface Props {
  open: boolean
  onClose: () => void
  produtoExistente?: Produto
}

export function ProdutoFormDialog({ open, onClose, produtoExistente }: Props): ReactNode {
  const [form, setForm] = useState<FormState>(VAZIO)
  const [erro, setErro] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const editando = Boolean(produtoExistente)

  useEffect(() => {
    if (open) {
      setForm(produtoExistente ? produtoParaForm(produtoExistente) : VAZIO)
      setErro(null)
    }
  }, [open, produtoExistente])

  // Sugestao de preco pelo custo x margem - RN-09 (o usuario ainda pode
  // sobrescrever o preco de venda a mao antes de salvar).
  const precoSugerido = useMemo(() => {
    const custo = Number(form.custoTexto.replace(',', '.'))
    const margem = Number(form.margemTexto.replace(',', '.'))
    if (!Number.isFinite(custo) || !Number.isFinite(margem) || custo <= 0) return null
    return custo * (1 + margem / 100)
  }, [form.custoTexto, form.margemTexto])

  const mutation = useMutation({
    mutationFn: async () => {
      const dados: ProdutoInput = produtoInputSchema.parse({
        codigo: form.codigo,
        codigoBarras: form.codigoBarras,
        descricao: form.descricao,
        categoria: form.categoria,
        marca: form.marca,
        modelo: form.modelo,
        cor: form.cor,
        tamanho: form.tamanho,
        unidade: form.unidade || 'UN',
        custoCentavos: form.custoTexto || '0',
        margem: form.margemTexto || '0',
        precoVendaCentavos: form.precoVendaTexto || '0',
        estoqueMinimo: form.estoqueMinimo || '0',
        lenteMaterial: form.lenteMaterial,
        lenteIndice: form.lenteIndice,
        lenteTipo: form.lenteTipo,
        lenteGrauMin: form.lenteGrauMin,
        lenteGrauMax: form.lenteGrauMax
      })
      if (editando && produtoExistente) {
        return unwrap(window.api.produtos.update({ id: produtoExistente.id, dados }))
      }
      return unwrap(window.api.produtos.create(dados))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['produtos'] })
      toast.ok(editando ? 'Produto atualizado.' : 'Produto cadastrado.')
      onClose()
    },
    onError: (err) => {
      setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
    }
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <Dialog open={open} onClose={onClose} title={editando ? 'Editar produto' : 'Novo produto'} className="max-w-2xl">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <legend className="col-span-full mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
            Identificação
          </legend>
          <Field label="Descrição" required className="sm:col-span-2">
            <Input value={form.descricao} onChange={(e) => set('descricao', e.target.value)} autoFocus required />
          </Field>
          <Field label="Categoria" required>
            <Select value={form.categoria} onChange={(e) => set('categoria', e.target.value as FormState['categoria'])}>
              <option value="armacao">Armação</option>
              <option value="lente">Lente</option>
              <option value="acessorio">Acessório</option>
              <option value="servico">Serviço</option>
            </Select>
          </Field>
          <Field label="Unidade">
            <Input value={form.unidade} onChange={(e) => set('unidade', e.target.value)} placeholder="UN" />
          </Field>
          <Field label="Código interno">
            <Input value={form.codigo} onChange={(e) => set('codigo', e.target.value)} />
          </Field>
          <Field label="Código de barras">
            <Input value={form.codigoBarras} onChange={(e) => set('codigoBarras', e.target.value)} />
          </Field>
          <Field label="Marca">
            <Input value={form.marca} onChange={(e) => set('marca', e.target.value)} />
          </Field>
          <Field label="Modelo">
            <Input value={form.modelo} onChange={(e) => set('modelo', e.target.value)} />
          </Field>
          <Field label="Cor">
            <Input value={form.cor} onChange={(e) => set('cor', e.target.value)} />
          </Field>
          <Field label="Tamanho">
            <Input value={form.tamanho} onChange={(e) => set('tamanho', e.target.value)} />
          </Field>
        </fieldset>

        {form.categoria === 'lente' && (
          <fieldset className="grid grid-cols-1 gap-3 rounded-md border border-[var(--rule)] p-3 sm:grid-cols-2">
            <legend className="col-span-full mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
              Detalhes da lente
            </legend>
            <Field label="Material">
              <Input value={form.lenteMaterial} onChange={(e) => set('lenteMaterial', e.target.value)} placeholder="Resina, policarbonato…" />
            </Field>
            <Field label="Índice de refração">
              <Input className="font-mono-tab" value={form.lenteIndice} onChange={(e) => set('lenteIndice', e.target.value)} placeholder="1,56" />
            </Field>
            <Field label="Tipo">
              <Input value={form.lenteTipo} onChange={(e) => set('lenteTipo', e.target.value)} placeholder="Visão simples, multifocal…" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Grau mín.">
                <Input className="font-mono-tab" value={form.lenteGrauMin} onChange={(e) => set('lenteGrauMin', e.target.value)} />
              </Field>
              <Field label="Grau máx.">
                <Input className="font-mono-tab" value={form.lenteGrauMax} onChange={(e) => set('lenteGrauMax', e.target.value)} />
              </Field>
            </div>
          </fieldset>
        )}

        <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <legend className="col-span-full mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
            Preço e estoque
          </legend>
          <Field label="Custo (R$)">
            <Input className="font-mono-tab" value={form.custoTexto} onChange={(e) => set('custoTexto', e.target.value)} placeholder="0,00" />
          </Field>
          <Field label="Margem (%)">
            <Input className="font-mono-tab" value={form.margemTexto} onChange={(e) => set('margemTexto', e.target.value)} placeholder="0" />
          </Field>
          <Field label="Preço de venda (R$)" required>
            <Input
              className="font-mono-tab"
              value={form.precoVendaTexto}
              onChange={(e) => set('precoVendaTexto', e.target.value)}
              placeholder="0,00"
              required
            />
          </Field>
          <Field label="Estoque mínimo">
            <Input className="font-mono-tab" value={form.estoqueMinimo} onChange={(e) => set('estoqueMinimo', e.target.value)} />
          </Field>
        </fieldset>

        {precoSugerido !== null && (
          <p className="-mt-2 text-xs text-[var(--ink-3)]">
            Sugestão pela margem:{' '}
            <button
              type="button"
              onClick={() => set('precoVendaTexto', precoSugerido.toFixed(2).replace('.', ','))}
              className="font-mono-tab font-medium text-[var(--accent)] hover:underline"
            >
              R$ {precoSugerido.toFixed(2).replace('.', ',')}
            </button>
          </p>
        )}

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 border-t border-[var(--rule)] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {editando ? 'Salvar alterações' : 'Cadastrar produto'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
