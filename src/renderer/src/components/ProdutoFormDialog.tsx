import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { DioptriaInput } from '@renderer/components/ui/DioptriaInput'
import { LIMITES_GRAU_LENTE, validarFaixaDeGrau } from '@shared/dioptria'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { produtoInputSchema, type ProdutoInput } from '@shared/ipc'
import { centavosParaTexto } from '@renderer/lib/dinheiro'
import { toast } from '@renderer/state/toastStore'
import { UNIDADE_PADRAO, type CategoriaProduto, type Produto } from '@shared/types'
import { enterAvancaCampo } from '@renderer/lib/enterAvancaCampo'
import { CHAVE_UNIDADES_MEDIDA, rotuloUnidade, useUnidadesMedida } from '@renderer/lib/unidadesMedida'
import { NovaUnidadeMedidaForm } from '@renderer/components/NovaUnidadeMedidaForm'
import { useAuthStore } from '@renderer/state/authStore'
import { possuiPermissao } from '@shared/permissions'

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
  lenteGrauMin: number | null
  lenteGrauMax: number | null
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
  unidade: UNIDADE_PADRAO,
  custoTexto: '',
  margemTexto: '',
  precoVendaTexto: '',
  estoqueMinimo: '0',
  lenteMaterial: '',
  lenteIndice: '',
  lenteTipo: '',
  lenteGrauMin: null,
  lenteGrauMax: null
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
    lenteGrauMin: p.lenteGrauMin,
    lenteGrauMax: p.lenteGrauMax
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
  const [novaUnidadeAberta, setNovaUnidadeAberta] = useState(false)
  const queryClient = useQueryClient()
  const editando = Boolean(produtoExistente)
  const unidades = useUnidadesMedida()
  const sessao = useAuthStore((s) => s.sessao)
  const podeCadastrarUnidade = sessao ? possuiPermissao(sessao.usuario.perfil, 'produtos', 'criar') : false

  useEffect(() => {
    if (open) {
      setForm(produtoExistente ? produtoParaForm(produtoExistente) : VAZIO)
      setErro(null)
      setNovaUnidadeAberta(false)
    }
  }, [open, produtoExistente])

  // So as unidades ativas, mais a que o produto ja tem se ela saiu da lista
  // (desativada depois): sem isso o campo mostraria outra unidade e salvar trocaria a do produto.
  const opcoesUnidade = useMemo(() => {
    const todas = unidades.data ?? []
    const opcoes = todas.filter((u) => u.ativo).map((u) => ({ sigla: u.sigla, rotulo: rotuloUnidade(u) }))
    if (!opcoes.some((o) => o.sigla === form.unidade)) {
      const atual = todas.find((u) => u.sigla === form.unidade)
      opcoes.push({ sigla: form.unidade, rotulo: atual ? `${rotuloUnidade(atual)} (desativada)` : form.unidade })
    }
    return opcoes
  }, [unidades.data, form.unidade])

  // Sugestao de preco pelo custo x margem - RN-09 (o usuario ainda pode
  // sobrescrever o preco de venda a mao antes de salvar).
  const precoSugerido = useMemo(() => {
    const custo = Number(form.custoTexto.replace(',', '.'))
    const margem = Number(form.margemTexto.replace(',', '.'))
    if (!Number.isFinite(custo) || !Number.isFinite(margem) || custo <= 0) return null
    return custo * (1 + margem / 100)
  }, [form.custoTexto, form.margemTexto])

  // Grau minimo/maximo so valem para lente; a mesma regra do servidor (minimo nunca maior que o maximo).
  const problemaGrau = useMemo(
    () => (form.categoria === 'lente' ? validarFaixaDeGrau(form.lenteGrauMin, form.lenteGrauMax) : null),
    [form.categoria, form.lenteGrauMin, form.lenteGrauMax]
  )

  const mutation = useMutation({
    mutationFn: async () => {
      if (problemaGrau) throw new Error(problemaGrau.mensagem)
      const dados: ProdutoInput = produtoInputSchema.parse({
        codigo: form.codigo,
        codigoBarras: form.codigoBarras,
        descricao: form.descricao,
        categoria: form.categoria,
        marca: form.marca,
        modelo: form.modelo,
        cor: form.cor,
        tamanho: form.tamanho,
        unidade: form.unidade || UNIDADE_PADRAO,
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
      // A lista de unidades mostra quantos produtos usam cada uma.
      queryClient.invalidateQueries({ queryKey: CHAVE_UNIDADES_MEDIDA })
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
        // Enter só passa para o próximo campo: o formulário só envia pelo botão.
        onKeyDown={enterAvancaCampo}
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
          <Field label="Unidade de medida" hint="Como o produto é contado no estoque">
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Select value={form.unidade} onChange={(e) => set('unidade', e.target.value)}>
                  {opcoesUnidade.map((o) => (
                    <option key={o.sigla} value={o.sigla}>
                      {o.rotulo}
                    </option>
                  ))}
                </Select>
              </div>
              {podeCadastrarUnidade && (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 w-9 shrink-0 px-0"
                  title="Cadastrar nova unidade de medida"
                  aria-label="Cadastrar nova unidade de medida"
                  onClick={() => setNovaUnidadeAberta(true)}
                >
                  <Plus className="size-4" />
                </Button>
              )}
            </div>
          </Field>
          {novaUnidadeAberta && (
            <div className="rounded-md border border-[var(--rule)] bg-[var(--surface-2)] p-3 sm:col-span-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">Nova unidade de medida</p>
              <NovaUnidadeMedidaForm
                autoFocus
                onCriada={(u) => {
                  set('unidade', u.sigla)
                  setNovaUnidadeAberta(false)
                }}
                onCancelar={() => setNovaUnidadeAberta(false)}
              />
            </div>
          )}
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
              <Field label="Grau mín." error={problemaGrau?.campo === 'min' ? problemaGrau.mensagem : undefined}>
                <DioptriaInput
                  aria-label="Grau mínimo"
                  value={form.lenteGrauMin}
                  min={LIMITES_GRAU_LENTE.min}
                  max={LIMITES_GRAU_LENTE.max}
                  invalid={problemaGrau?.campo === 'min'}
                  onChange={(v) => set('lenteGrauMin', v)}
                />
              </Field>
              <Field label="Grau máx." error={problemaGrau?.campo === 'max' ? problemaGrau.mensagem : undefined}>
                <DioptriaInput
                  aria-label="Grau máximo"
                  value={form.lenteGrauMax}
                  min={LIMITES_GRAU_LENTE.min}
                  max={LIMITES_GRAU_LENTE.max}
                  invalid={problemaGrau?.campo === 'max'}
                  onChange={(v) => set('lenteGrauMax', v)}
                />
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
