import { type ReactNode, useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { fornecedorInputSchema, type FornecedorInput } from '@shared/ipc'
import { toast } from '@renderer/state/toastStore'
import type { Fornecedor } from '@shared/types'

interface FormState {
  razaoSocial: string
  cnpj: string
  contato: string
  telefone: string
  email: string
  prazoEntregaDias: string
}

const VAZIO: FormState = { razaoSocial: '', cnpj: '', contato: '', telefone: '', email: '', prazoEntregaDias: '' }

function fornecedorParaForm(f: Fornecedor): FormState {
  return {
    razaoSocial: f.razaoSocial,
    cnpj: f.cnpj ?? '',
    contato: f.contato ?? '',
    telefone: f.telefone ?? '',
    email: f.email ?? '',
    prazoEntregaDias: f.prazoEntregaDias !== null ? String(f.prazoEntregaDias) : ''
  }
}

interface Props {
  open: boolean
  onClose: () => void
  fornecedorExistente?: Fornecedor
}

export function FornecedorFormDialog({ open, onClose, fornecedorExistente }: Props): ReactNode {
  const [form, setForm] = useState<FormState>(VAZIO)
  const [erro, setErro] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const editando = Boolean(fornecedorExistente)

  useEffect(() => {
    if (open) {
      setForm(fornecedorExistente ? fornecedorParaForm(fornecedorExistente) : VAZIO)
      setErro(null)
    }
  }, [open, fornecedorExistente])

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const dados: FornecedorInput = fornecedorInputSchema.parse({
        razaoSocial: form.razaoSocial,
        cnpj: form.cnpj,
        contato: form.contato,
        telefone: form.telefone,
        email: form.email,
        prazoEntregaDias: form.prazoEntregaDias
      })
      if (editando && fornecedorExistente) {
        return unwrap(window.api.fornecedores.update({ id: fornecedorExistente.id, dados }))
      }
      return unwrap(window.api.fornecedores.create(dados))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fornecedores'] })
      toast.ok(editando ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.')
      onClose()
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  return (
    <Dialog open={open} onClose={onClose} title={editando ? 'Editar fornecedor' : 'Novo fornecedor'} className="max-w-lg">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <Field label="Razão social" required>
          <Input value={form.razaoSocial} onChange={(e) => set('razaoSocial', e.target.value)} autoFocus required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CNPJ">
            <Input value={form.cnpj} onChange={(e) => set('cnpj', e.target.value)} />
          </Field>
          <Field label="Prazo de entrega (dias)">
            <Input className="font-mono-tab" value={form.prazoEntregaDias} onChange={(e) => set('prazoEntregaDias', e.target.value)} />
          </Field>
        </div>
        <Field label="Contato">
          <Input value={form.contato} onChange={(e) => set('contato', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Telefone">
            <Input value={form.telefone} onChange={(e) => set('telefone', e.target.value)} />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
        </div>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 border-t border-[var(--rule)] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {editando ? 'Salvar alterações' : 'Cadastrar fornecedor'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
