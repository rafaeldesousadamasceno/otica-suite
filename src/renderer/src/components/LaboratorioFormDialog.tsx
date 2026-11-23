import { type ReactNode, useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { TelefoneInput } from '@renderer/components/ui/TelefoneInput'
import { NumeroInput } from '@renderer/components/ui/NumeroInput'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { enterAvancaCampo } from '@renderer/lib/enterAvancaCampo'
import { toast } from '@renderer/state/toastStore'
import { laboratorioInputSchema, type LaboratorioInput } from '@shared/ipc'
import { cnpjValido } from '@shared/cnpj'
import { mascararCnpj } from '@shared/mascaras'
import type { Laboratorio } from '@shared/types'

interface FormState {
  nome: string
  razaoSocial: string
  cnpj: string
  telefone: string
  whatsapp: string
  email: string
  endereco: string
  contatoResponsavel: string
  prazoMedioDias: number | null
  observacoes: string
  ativo: boolean
}

const VAZIO: FormState = {
  nome: '', razaoSocial: '', cnpj: '', telefone: '', whatsapp: '', email: '', endereco: '',
  contatoResponsavel: '', prazoMedioDias: null, observacoes: '', ativo: true
}

function paraForm(l: Laboratorio): FormState {
  return {
    nome: l.nome,
    razaoSocial: l.razaoSocial ?? '',
    cnpj: mascararCnpj(l.cnpj),
    telefone: l.telefone ?? '',
    whatsapp: l.whatsapp ?? '',
    email: l.email ?? '',
    endereco: l.endereco ?? '',
    contatoResponsavel: l.contatoResponsavel ?? '',
    prazoMedioDias: l.prazoMedioDias,
    observacoes: l.observacoes ?? '',
    ativo: l.ativo
  }
}

interface Props {
  open: boolean
  onClose: () => void
  laboratorio?: Laboratorio
}

export function LaboratorioFormDialog({ open, onClose, laboratorio }: Props): ReactNode {
  const queryClient = useQueryClient()
  const editando = Boolean(laboratorio)
  const [form, setForm] = useState<FormState>(VAZIO)
  const [erro, setErro] = useState<string | null>(null)
  const [cnpjSaiu, setCnpjSaiu] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(laboratorio ? paraForm(laboratorio) : VAZIO)
      setErro(null)
      setCnpjSaiu(false)
    }
  }, [open, laboratorio])

  const set = <K extends keyof FormState>(chave: K, valor: FormState[K]): void => setForm((f) => ({ ...f, [chave]: valor }))
  const cnpjInvalido = cnpjSaiu && form.cnpj.replace(/\D/g, '') !== '' && !cnpjValido(form.cnpj)

  const mutation = useMutation({
    mutationFn: async () => {
      const dados: LaboratorioInput = laboratorioInputSchema.parse({
        nome: form.nome,
        razaoSocial: form.razaoSocial,
        cnpj: form.cnpj,
        telefone: form.telefone,
        whatsapp: form.whatsapp,
        email: form.email,
        endereco: form.endereco,
        contatoResponsavel: form.contatoResponsavel,
        prazoMedioDias: form.prazoMedioDias,
        observacoes: form.observacoes
      })
      if (laboratorio) {
        const salvo = await unwrap(window.api.laboratorios.update({ id: laboratorio.id, dados }))
        if (form.ativo !== laboratorio.ativo) await unwrap(window.api.laboratorios.setAtivo({ id: laboratorio.id, ativo: form.ativo }))
        return salvo
      }
      const criado = await unwrap(window.api.laboratorios.create(dados))
      if (!form.ativo) await unwrap(window.api.laboratorios.setAtivo({ id: criado.id, ativo: false }))
      return criado
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laboratorios'] })
      queryClient.invalidateQueries({ queryKey: ['ordensServico'] })
      toast.ok(editando ? 'Laboratório atualizado.' : 'Laboratório cadastrado.')
      onClose()
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  return (
    <Dialog open={open} onClose={onClose} title={editando ? 'Editar laboratório' : 'Novo laboratório'} className="max-w-2xl">
      <form
        onKeyDown={enterAvancaCampo}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
        noValidate
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nome" required>
            <Input value={form.nome} onChange={(e) => set('nome', e.target.value)} autoFocus maxLength={80} />
          </Field>
          <Field label="Razão social">
            <Input value={form.razaoSocial} onChange={(e) => set('razaoSocial', e.target.value)} />
          </Field>
          <Field label="CNPJ" error={cnpjInvalido ? 'CNPJ inválido: confira os números.' : undefined}>
            <Input
              value={form.cnpj}
              onChange={(e) => set('cnpj', mascararCnpj(e.target.value))}
              onBlur={() => setCnpjSaiu(true)}
              inputMode="numeric"
              placeholder="00.000.000/0000-00"
              invalid={cnpjInvalido}
              className={cnpjInvalido ? 'border-[var(--danger)]!' : undefined}
            />
          </Field>
          <Field label="Contato responsável">
            <Input value={form.contatoResponsavel} onChange={(e) => set('contatoResponsavel', e.target.value)} />
          </Field>
          <Field label="Telefone">
            <TelefoneInput value={form.telefone} onChange={(v) => set('telefone', v)} aria-label="Telefone" />
          </Field>
          <Field label="WhatsApp">
            <TelefoneInput value={form.whatsapp} onChange={(v) => set('whatsapp', v)} aria-label="WhatsApp" />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Prazo médio de entrega" hint="Em dias.">
            <NumeroInput value={form.prazoMedioDias} casas={0} unidade="dias" aria-label="Prazo médio de entrega" onChange={(v) => set('prazoMedioDias', v)} />
          </Field>
        </div>
        <Field label="Endereço">
          <Input value={form.endereco} onChange={(e) => set('endereco', e.target.value)} />
        </Field>
        <Field label="Observações">
          <textarea
            className="min-h-16 w-full rounded-md border border-[var(--rule-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)]"
            value={form.observacoes}
            onChange={(e) => set('observacoes', e.target.value)}
          />
        </Field>

        <label className="flex items-start gap-2 text-sm text-[var(--ink-2)]">
          <input type="checkbox" className="mt-0.5" checked={form.ativo} onChange={(e) => set('ativo', e.target.checked)} />
          <span>
            <b className="text-[var(--ink)]">Ativo</b>
            <span className="block text-xs text-[var(--ink-3)]">Laboratório inativo não aparece nas novas OS; as OS antigas continuam mostrando o nome dele.</span>
          </span>
        </label>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 border-t border-[var(--rule)] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {editando ? 'Salvar alterações' : 'Cadastrar laboratório'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
