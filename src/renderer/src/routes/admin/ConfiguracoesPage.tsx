import { type ChangeEvent, type ReactNode, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, X } from 'lucide-react'
import { Card, CardBody, CardHeader, CardTitle } from '@renderer/components/ui/Card'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { mascararCep, mascararCnpj, mascararTelefone } from '@shared/mascaras'
import { Select } from '@renderer/components/ui/Select'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { empresaUpdateSchema, configuracaoOperacionalSchema, type EmpresaUpdateInput, type ConfiguracaoOperacionalInput } from '@shared/ipc'
import { UNIDADES_FEDERATIVAS } from '@shared/types'
import { toast } from '@renderer/state/toastStore'

function fileParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function ConfiguracoesPage(): ReactNode {
  const queryClient = useQueryClient()
  const empresa = useQuery({ queryKey: ['empresa'], queryFn: () => unwrap(window.api.empresa.get()) })
  const [form, setForm] = useState<EmpresaUpdateInput | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviandoLogo, setEnviandoLogo] = useState(false)
  const [removendoLogo, setRemovendoLogo] = useState(false)

  const operacional = useQuery({
    queryKey: ['configuracoes', 'operacional'],
    queryFn: () => unwrap(window.api.configuracoes.getOperacional())
  })
  const [formOperacional, setFormOperacional] = useState<ConfiguracaoOperacionalInput | null>(null)
  const [erroOperacional, setErroOperacional] = useState<string | null>(null)

  useEffect(() => {
    if (operacional.data) setFormOperacional(operacional.data)
  }, [operacional.data])

  function setOperacional<K extends keyof ConfiguracaoOperacionalInput>(key: K, value: ConfiguracaoOperacionalInput[K]): void {
    setFormOperacional((f) => (f ? { ...f, [key]: value } : f))
  }

  const salvarOperacional = useMutation({
    mutationFn: () => unwrap(window.api.configuracoes.updateOperacional(configuracaoOperacionalSchema.parse(formOperacional))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracoes', 'operacional'] })
      toast.ok('Configurações operacionais salvas.')
    },
    onError: (err) =>
      setErroOperacional(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  useEffect(() => {
    if (empresa.data) {
      setForm({
        nomeFantasia: empresa.data.nomeFantasia,
        razaoSocial: empresa.data.razaoSocial,
        cnpj: empresa.data.cnpj ? mascararCnpj(empresa.data.cnpj) : empresa.data.cnpj,
        ie: empresa.data.ie,
        logradouro: empresa.data.logradouro,
        numero: empresa.data.numero,
        complemento: empresa.data.complemento,
        bairro: empresa.data.bairro,
        cidade: empresa.data.cidade,
        uf: empresa.data.uf,
        cep: empresa.data.cep ? mascararCep(empresa.data.cep) : empresa.data.cep,
        telefone: empresa.data.telefone ? mascararTelefone(empresa.data.telefone) : empresa.data.telefone,
        whatsapp: empresa.data.whatsapp ? mascararTelefone(empresa.data.whatsapp) : empresa.data.whatsapp,
        email: empresa.data.email,
        site: empresa.data.site,
        corDestaque: empresa.data.corDestaque,
        tema: empresa.data.tema,
        logoFormato: empresa.data.logoFormato
      })
    }
  }, [empresa.data])

  const salvar = useMutation({
    mutationFn: () => unwrap(window.api.empresa.update(empresaUpdateSchema.parse(form))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa'] })
      toast.ok('Configurações salvas.')
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  async function onSelecionarLogo(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0]
    if (!file) return
    setEnviandoLogo(true)
    try {
      const dataBase64 = await fileParaBase64(file)
      await unwrap(window.api.empresa.uploadLogo({ fileName: file.name, dataBase64 }))
      queryClient.invalidateQueries({ queryKey: ['empresa'] })
      toast.ok('Logo atualizada.')
    } catch (err) {
      toast.error(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro ao enviar a imagem.')
    } finally {
      setEnviandoLogo(false)
      e.target.value = ''
    }
  }

  async function onRemoverLogo(): Promise<void> {
    if (!confirm('Remover a logo atual? A sidebar e a tela de login voltam a mostrar o ícone padrão.')) return
    setRemovendoLogo(true)
    try {
      await unwrap(window.api.empresa.removerLogo())
      queryClient.invalidateQueries({ queryKey: ['empresa'] })
      toast.ok('Logo removida.')
    } catch (err) {
      toast.error(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro ao remover a logo.')
    } finally {
      setRemovendoLogo(false)
    }
  }

  if (!form) return <p className="text-sm text-[var(--ink-3)]">Carregando…</p>

  function set<K extends keyof EmpresaUpdateInput>(key: K, value: EmpresaUpdateInput[K]): void {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--ink)]">Configurações</h1>

      <Card>
        <CardHeader>
          <CardTitle>Identidade visual</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-5">
          <div className="flex items-center gap-6">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden border border-[var(--rule)] bg-[var(--surface-2)]">
              {empresa.data?.logoPath ? (
                <img src={empresa.data.logoPath} alt="Logo" className="size-full object-cover" />
              ) : (
                <span className="text-xs text-[var(--ink-3)]">Sem logo</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <label className="inline-block">
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={onSelecionarLogo} />
                  <Button type="button" variant="secondary" loading={enviandoLogo} className="pointer-events-none">
                    <Upload className="size-4" /> Enviar nova logo
                  </Button>
                </label>
                {empresa.data?.logoPath && (
                  <Button type="button" variant="ghost" loading={removendoLogo} onClick={onRemoverLogo}>
                    <X className="size-4" /> Remover
                  </Button>
                )}
              </div>
              <p className="text-xs text-[var(--ink-3)]">PNG, JPG ou SVG · até 3 MB</p>
              <p className="max-w-xs text-xs text-[var(--ink-3)]">
                Ideal: quadrada, <span className="font-mono-tab">512×512 px</span> ou maior, fundo
                transparente. Aparece pequena no dia a dia, mas em tamanho maior nos relatórios
                impressos.
              </p>
            </div>
            <div className="ml-auto flex flex-col items-center gap-2">
              <label className="text-xs text-[var(--ink-3)]">Cor de destaque</label>
              <input
                type="color"
                value={form.corDestaque}
                onChange={(e) => set('corDestaque', e.target.value)}
                className="size-10 cursor-pointer rounded border border-[var(--rule-strong)] bg-transparent"
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dados da ótica</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nome fantasia" required className="sm:col-span-2">
            <Input value={form.nomeFantasia} onChange={(e) => set('nomeFantasia', e.target.value)} required />
          </Field>
          <Field label="Razão social">
            <Input value={form.razaoSocial ?? ''} onChange={(e) => set('razaoSocial', e.target.value)} />
          </Field>
          <Field label="CNPJ">
            <Input value={form.cnpj ?? ''} onChange={(e) => set('cnpj', mascararCnpj(e.target.value))} inputMode="numeric" placeholder="00.000.000/0000-00" />
          </Field>
          <Field label="Inscrição estadual">
            <Input value={form.ie ?? ''} onChange={(e) => set('ie', e.target.value)} />
          </Field>
          <Field label="Tema">
            <Select value={form.tema} onChange={(e) => set('tema', e.target.value as EmpresaUpdateInput['tema'])}>
              <option value="sistema">Automático (segue o sistema)</option>
              <option value="claro">Claro</option>
              <option value="escuro">Escuro</option>
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Endereço e contato</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <Field label="CEP" className="sm:col-span-2">
            <Input value={form.cep ?? ''} onChange={(e) => set('cep', mascararCep(e.target.value))} inputMode="numeric" placeholder="00000-000" />
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
          <Field label="Telefone" className="sm:col-span-2">
            <Input value={form.telefone ?? ''} onChange={(e) => set('telefone', mascararTelefone(e.target.value))} inputMode="tel" placeholder="(00) 0000-0000" />
          </Field>
          <Field label="WhatsApp" className="sm:col-span-2">
            <Input value={form.whatsapp ?? ''} onChange={(e) => set('whatsapp', mascararTelefone(e.target.value))} inputMode="tel" placeholder="(00) 00000-0000" />
          </Field>
          <Field label="E-mail" className="sm:col-span-2">
            <Input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Site" className="sm:col-span-6">
            <Input value={form.site ?? ''} onChange={(e) => set('site', e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

      <div className="flex justify-end">
        <Button onClick={() => salvar.mutate()} loading={salvar.isPending}>
          Salvar configurações
        </Button>
      </div>

      {formOperacional && (
        <Card>
          <CardHeader>
            <CardTitle>Operacional</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Limite de desconto do vendedor (%)" hint="Acima disso, exige autorização de um administrador (RN-07)">
                <Input
                  className="font-mono-tab"
                  value={String(formOperacional.limiteDescontoVendedorPct)}
                  onChange={(e) => setOperacional('limiteDescontoVendedorPct', Number(e.target.value) || 0)}
                />
              </Field>
              <Field label="Comissão padrão do vendedor (%)">
                <Input
                  className="font-mono-tab"
                  value={String(formOperacional.comissaoPadraoPct)}
                  onChange={(e) => setOperacional('comissaoPadraoPct', Number(e.target.value) || 0)}
                />
              </Field>
              <Field label="Dias de garantia">
                <Input
                  className="font-mono-tab"
                  value={String(formOperacional.diasGarantia)}
                  onChange={(e) => setOperacional('diasGarantia', Number(e.target.value) || 0)}
                />
              </Field>
              <Field label="Sessão expira após (minutos)">
                <Input
                  className="font-mono-tab"
                  value={String(formOperacional.sessaoExpiraMinutos)}
                  onChange={(e) => setOperacional('sessaoExpiraMinutos', Number(e.target.value) || 1)}
                />
              </Field>
              <Field label="Prefixo da OS" hint='Ex.: "2026-" — em branco não usa prefixo'>
                <Input value={formOperacional.prefixoOS ?? ''} onChange={(e) => setOperacional('prefixoOS', e.target.value)} />
              </Field>
            </div>

            <label className="flex items-start gap-2 text-sm text-[var(--ink-2)]">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={formOperacional.estoqueBloqueiaVendaSemSaldo}
                onChange={(e) => setOperacional('estoqueBloqueiaVendaSemSaldo', e.target.checked)}
              />
              <span>
                Exigir autorização de administrador para vender produto sem saldo em estoque (RF-08). Um Vendedor
                sozinho, sem um Admin por perto, fica impedido de concluir essa venda.
              </span>
            </label>

            {erroOperacional && <p className="text-sm text-[var(--danger)]">{erroOperacional}</p>}

            <div className="flex justify-end">
              <Button onClick={() => salvarOperacional.mutate()} loading={salvarOperacional.isPending}>
                Salvar operacional
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
