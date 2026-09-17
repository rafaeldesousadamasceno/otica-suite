import { type ReactNode, useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { clienteInputSchema, type ClienteInput } from '@shared/ipc'
import { UNIDADES_FEDERATIVAS } from '@shared/types'
import type { Cliente } from '@shared/types'
import { toast } from '@renderer/state/toastStore'

const VAZIO: ClienteInput = {
  nome: '',
  dataNasc: '',
  cpf: '',
  rg: '',
  celular: '',
  telefone: '',
  email: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  cep: '',
  profissao: '',
  indicadoPor: '',
  observacao: ''
}

function clienteParaForm(c: Cliente): ClienteInput {
  return {
    nome: c.nome,
    dataNasc: c.dataNasc ?? '',
    cpf: c.cpf ?? '',
    rg: c.rg ?? '',
    celular: c.celular ?? '',
    telefone: c.telefone ?? '',
    email: c.email ?? '',
    logradouro: c.logradouro ?? '',
    numero: c.numero ?? '',
    complemento: c.complemento ?? '',
    bairro: c.bairro ?? '',
    cidade: c.cidade ?? '',
    uf: c.uf ?? '',
    cep: c.cep ?? '',
    profissao: c.profissao ?? '',
    indicadoPor: c.indicadoPor ?? '',
    observacao: c.observacao ?? ''
  }
}

interface Props {
  open: boolean
  onClose: () => void
  clienteExistente?: Cliente
  onSaved?: (cliente: Cliente) => void
}

export function ClienteFormDialog({ open, onClose, clienteExistente, onSaved }: Props): ReactNode {
  const [form, setForm] = useState<ClienteInput>(VAZIO)
  const [erro, setErro] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const editando = Boolean(clienteExistente)

  useEffect(() => {
    if (open) {
      setForm(clienteExistente ? clienteParaForm(clienteExistente) : VAZIO)
      setErro(null)
    }
  }, [open, clienteExistente])

  const mutation = useMutation({
    mutationFn: async () => {
      const dados = clienteInputSchema.parse(form)
      if (editando && clienteExistente) {
        return unwrap(window.api.clientes.update({ id: clienteExistente.id, dados }))
      }
      return unwrap(window.api.clientes.create(dados))
    },
    onSuccess: (cliente) => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] })
      queryClient.invalidateQueries({ queryKey: ['cliente', cliente.id] })
      toast.ok(editando ? 'Cliente atualizado.' : 'Cliente cadastrado.')
      onSaved?.(cliente)
      onClose()
    },
    onError: (err) => {
      setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
    }
  })

  function set<K extends keyof ClienteInput>(key: K, value: string): void {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editando ? 'Editar cliente' : 'Novo cliente'}
      className="max-w-2xl"
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <legend className="col-span-full mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
            Dados pessoais
          </legend>
          <Field label="Nome completo" required className="sm:col-span-2">
            <Input value={form.nome ?? ''} onChange={(e) => set('nome', e.target.value)} autoFocus required />
          </Field>
          <Field label="Data de nascimento" hint="AAAA-MM-DD">
            <Input type="date" value={form.dataNasc ?? ''} onChange={(e) => set('dataNasc', e.target.value)} />
          </Field>
          <Field label="CPF">
            <Input value={form.cpf ?? ''} onChange={(e) => set('cpf', e.target.value)} placeholder="000.000.000-00" />
          </Field>
          <Field label="RG">
            <Input value={form.rg ?? ''} onChange={(e) => set('rg', e.target.value)} />
          </Field>
          <Field label="Profissão">
            <Input value={form.profissao ?? ''} onChange={(e) => set('profissao', e.target.value)} />
          </Field>
          <Field label="Celular">
            <Input value={form.celular ?? ''} onChange={(e) => set('celular', e.target.value)} placeholder="(00) 00000-0000" />
          </Field>
          <Field label="Telefone">
            <Input value={form.telefone ?? ''} onChange={(e) => set('telefone', e.target.value)} />
          </Field>
          <Field label="E-mail" className="sm:col-span-2">
            <Input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
          </Field>
        </fieldset>

        <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <legend className="col-span-full mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
            Endereço
          </legend>
          <Field label="CEP" className="sm:col-span-2">
            <Input value={form.cep ?? ''} onChange={(e) => set('cep', e.target.value)} />
          </Field>
          <Field label="Logradouro" className="sm:col-span-4">
            <Input value={form.logradouro ?? ''} onChange={(e) => set('logradouro', e.target.value)} />
          </Field>
          <Field label="Número" className="sm:col-span-2">
            <Input value={form.numero ?? ''} onChange={(e) => set('numero', e.target.value)} />
          </Field>
          <Field label="Complemento" className="sm:col-span-4">
            <Input value={form.complemento ?? ''} onChange={(e) => set('complemento', e.target.value)} />
          </Field>
          <Field label="Bairro" className="sm:col-span-3">
            <Input value={form.bairro ?? ''} onChange={(e) => set('bairro', e.target.value)} />
          </Field>
          <Field label="Cidade" className="sm:col-span-2">
            <Input value={form.cidade ?? ''} onChange={(e) => set('cidade', e.target.value)} />
          </Field>
          <Field label="UF" className="sm:col-span-1">
            <Select value={form.uf ?? ''} onChange={(e) => set('uf', e.target.value)}>
              <option value="">—</option>
              {UNIDADES_FEDERATIVAS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </Select>
          </Field>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
            Outros
          </legend>
          <Field label="Indicado por">
            <Input value={form.indicadoPor ?? ''} onChange={(e) => set('indicadoPor', e.target.value)} />
          </Field>
          <Field label="Observações">
            <textarea
              className="min-h-20 w-full rounded-md border border-[var(--rule-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)]"
              value={form.observacao ?? ''}
              onChange={(e) => set('observacao', e.target.value)}
            />
          </Field>
        </fieldset>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 border-t border-[var(--rule)] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {editando ? 'Salvar alterações' : 'Cadastrar cliente'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
