import { type ChangeEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, X } from 'lucide-react'
import { Card, CardBody, CardHeader, CardTitle } from '@renderer/components/ui/Card'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { mascararCep, mascararCnpj, mascararTelefone } from '@shared/mascaras'
import { Select } from '@renderer/components/ui/Select'
import { Button } from '@renderer/components/ui/Button'
import { Badge } from '@renderer/components/ui/Badge'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { empresaUpdateSchema, configuracaoOperacionalSchema, type EmpresaUpdateInput, type ConfiguracaoOperacionalInput } from '@shared/ipc'
import { UNIDADES_FEDERATIVAS, type Empresa } from '@shared/types'
import { toast } from '@renderer/state/toastStore'
import { useConfirm } from '@renderer/lib/confirmar'
import { usePreferenciasStore } from '@renderer/state/preferenciasStore'
import { formatarDioptria, type FormatoNumero } from '@shared/dioptria'

function fileParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const OPCOES_FORMATO: { valor: FormatoNumero; titulo: string; exemplo: string; ajuda: string }[] = [
  {
    valor: 'decimal',
    titulo: 'Decimal',
    exemplo: formatarDioptria(1.25, { formato: 'decimal' }),
    ajuda: 'Como na prescrição em papel: digite 1,25 e aparece +1,25.'
  },
  {
    valor: 'inteiro',
    titulo: 'Inteiro',
    exemplo: formatarDioptria(1.25, { formato: 'inteiro' }),
    ajuda: 'Sem a vírgula: digite 125 e vale +1,25; digite -50 e vale -0,50.'
  }
]

type CampoEmpresa = keyof EmpresaUpdateInput

/**
 * Cada bloco da tela salva só os campos dele: o botão grava esses campos por cima do que já está salvo,
 * e o que foi digitado em outro bloco (ainda sem salvar) não é gravado de carona.
 */
interface BlocoEmpresa {
  campos: CampoEmpresa[]
  salvo: string
}

const BLOCO_IDENTIDADE: BlocoEmpresa = { campos: ['corDestaque', 'tema'], salvo: 'Identidade visual salva.' }
const BLOCO_DADOS: BlocoEmpresa = { campos: ['nomeFantasia', 'razaoSocial', 'cnpj', 'ie'], salvo: 'Dados da ótica salvos.' }
const BLOCO_ENDERECO: BlocoEmpresa = {
  campos: ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'telefone', 'whatsapp', 'email', 'site'],
  salvo: 'Endereço e contato salvos.'
}

/** Dados salvos da ótica, já no formato dos campos da tela (com máscara). */
function formDoServidor(d: Empresa): EmpresaUpdateInput {
  return {
    nomeFantasia: d.nomeFantasia,
    razaoSocial: d.razaoSocial,
    cnpj: d.cnpj ? mascararCnpj(d.cnpj) : d.cnpj,
    ie: d.ie,
    logradouro: d.logradouro,
    numero: d.numero,
    complemento: d.complemento,
    bairro: d.bairro,
    cidade: d.cidade,
    uf: d.uf,
    cep: d.cep ? mascararCep(d.cep) : d.cep,
    telefone: d.telefone ? mascararTelefone(d.telefone) : d.telefone,
    whatsapp: d.whatsapp ? mascararTelefone(d.whatsapp) : d.whatsapp,
    email: d.email,
    site: d.site,
    corDestaque: d.corDestaque,
    tema: d.tema,
    logoFormato: d.logoFormato
  }
}

const igual = (a: unknown, b: unknown): boolean => (a ?? '') === (b ?? '')

function soOsCampos(form: EmpresaUpdateInput, campos: CampoEmpresa[]): Partial<EmpresaUpdateInput> {
  const parte: Record<string, unknown> = {}
  for (const c of campos) parte[c] = form[c]
  return parte as Partial<EmpresaUpdateInput>
}

/** Bloco da tela: título, uma linha dizendo para que serve, conteúdo e (opcional) o rodapé com o botão de salvar. */
function Bloco({
  titulo,
  descricao,
  selo,
  rodape,
  children
}: {
  titulo: string
  descricao: string
  selo?: ReactNode
  rodape?: ReactNode
  children: ReactNode
}): ReactNode {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-0.5">
          <CardTitle>{titulo}</CardTitle>
          <p className="text-sm text-[var(--ink-3)]">{descricao}</p>
        </div>
        {selo && <span className="shrink-0 whitespace-nowrap">{selo}</span>}
      </CardHeader>
      <CardBody>{children}</CardBody>
      {rodape}
    </Card>
  )
}

/** Rodapé do bloco: diz o que o botão salva, avisa quando há alteração pendente e mostra o erro daquele bloco. */
function RodapeSalvar({
  rotulo,
  sujo,
  salvando,
  erro,
  onSalvar
}: {
  rotulo: string
  sujo: boolean
  salvando: boolean
  erro: string | null
  onSalvar: () => void
}): ReactNode {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-[var(--rule)] px-5 py-3">
      <p className={`text-sm ${erro ? 'text-[var(--danger)]' : 'text-[var(--ink-3)]'}`}>
        {erro ?? (sujo ? 'Há alterações neste bloco que ainda não foram salvas.' : 'Tudo salvo.')}
      </p>
      <Button variant={sujo ? 'primary' : 'secondary'} onClick={onSalvar} loading={salvando} disabled={!sujo}>
        {rotulo}
      </Button>
    </div>
  )
}

export function ConfiguracoesPage(): ReactNode {
  const confirmar = useConfirm()
  const formatoNumero = usePreferenciasStore((st) => st.formatoNumero)
  const setFormatoNumero = usePreferenciasStore((st) => st.setFormatoNumero)
  const exibirDp = usePreferenciasStore((st) => st.exibirDp)
  const setExibirDp = usePreferenciasStore((st) => st.setExibirDp)
  const queryClient = useQueryClient()
  const empresa = useQuery({ queryKey: ['empresa'], queryFn: () => unwrap(window.api.empresa.get()) })
  const [form, setForm] = useState<EmpresaUpdateInput | null>(null)
  const [erroBloco, setErroBloco] = useState<{ bloco: BlocoEmpresa; msg: string } | null>(null)
  const [enviandoLogo, setEnviandoLogo] = useState(false)
  const [removendoLogo, setRemovendoLogo] = useState(false)
  const baseAnterior = useRef<EmpresaUpdateInput | null>(null)

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
    onMutate: () => setErroOperacional(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracoes', 'operacional'] })
      toast.ok('Regras operacionais salvas.')
    },
    onError: (err) =>
      setErroOperacional(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  // Os dados salvos entram na tela uma vez; depois, uma atualização só troca o que o usuário NÃO mexeu,
  // para não apagar o que ele digitou em outro bloco e ainda não salvou.
  useEffect(() => {
    if (!empresa.data) return
    const nova = formDoServidor(empresa.data)
    setForm((atual) => {
      if (!atual) return nova
      const antiga = baseAnterior.current
      const resultado: Record<string, unknown> = { ...atual }
      for (const c of Object.keys(nova) as CampoEmpresa[]) {
        if (!antiga || igual(atual[c], antiga[c])) resultado[c] = nova[c]
      }
      return resultado as unknown as EmpresaUpdateInput
    })
    baseAnterior.current = nova
  }, [empresa.data])

  const base = empresa.data ? formDoServidor(empresa.data) : null
  const sujo = (bloco: BlocoEmpresa): boolean => !!form && !!base && bloco.campos.some((c) => !igual(form[c], base[c]))

  const salvarEmpresa = useMutation({
    mutationFn: (bloco: BlocoEmpresa) => {
      if (!form || !base) throw new Error('Dados ainda não carregados.')
      return unwrap(window.api.empresa.update(empresaUpdateSchema.parse({ ...base, ...soOsCampos(form, bloco.campos) })))
    },
    onMutate: () => setErroBloco(null),
    onSuccess: (_dados, bloco) => {
      queryClient.invalidateQueries({ queryKey: ['empresa'] })
      toast.ok(bloco.salvo)
    },
    onError: (err, bloco) =>
      setErroBloco({ bloco, msg: err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.' })
  })

  const salvandoBloco = (bloco: BlocoEmpresa): boolean => salvarEmpresa.isPending && salvarEmpresa.variables === bloco
  const erroDoBloco = (bloco: BlocoEmpresa): string | null => (erroBloco?.bloco === bloco ? erroBloco.msg : null)

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
    const ok = await confirmar({
      variante: 'excluir',
      entidade: 'logo',
      item: 'A logo atual da ótica',
      detalhe: 'A sidebar e a tela de login voltam a mostrar o ícone padrão.',
      rotuloConfirmar: 'Remover'
    })
    if (!ok) return
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

  const operacionalSujo =
    !!formOperacional && !!operacional.data && JSON.stringify(formOperacional) !== JSON.stringify(operacional.data)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <h1 className="text-xl font-semibold text-[var(--ink)]">Configurações</h1>

      <Bloco
        titulo="Identidade visual"
        descricao="A logo, a cor e o tema com que o sistema aparece."
        rodape={
          <RodapeSalvar
            rotulo="Salvar identidade visual"
            sujo={sujo(BLOCO_IDENTIDADE)}
            salvando={salvandoBloco(BLOCO_IDENTIDADE)}
            erro={erroDoBloco(BLOCO_IDENTIDADE)}
            onSalvar={() => salvarEmpresa.mutate(BLOCO_IDENTIDADE)}
          />
        }
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-5">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--rule)] bg-[var(--surface-2)]">
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
              <p className="text-xs text-[var(--ink-3)]">
                PNG, JPG ou SVG, até 3 MB. Ideal: quadrada, <span className="font-mono-tab">512×512 px</span> ou maior, com fundo
                transparente. Aparece pequena no dia a dia e maior nos relatórios impressos. A logo é enviada na hora, sem precisar
                salvar.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-[var(--rule)] pt-5 sm:grid-cols-2">
            <Field label="Cor de destaque">
              <input
                type="color"
                value={form.corDestaque}
                onChange={(e) => set('corDestaque', e.target.value)}
                className="h-10 w-20 cursor-pointer rounded border border-[var(--rule-strong)] bg-transparent"
              />
            </Field>
            <Field label="Tema" hint="Automático acompanha o tema claro ou escuro do Windows.">
              <Select value={form.tema} onChange={(e) => set('tema', e.target.value as EmpresaUpdateInput['tema'])}>
                <option value="sistema">Automático (segue o sistema)</option>
                <option value="claro">Claro</option>
                <option value="escuro">Escuro</option>
              </Select>
            </Field>
          </div>
        </div>
      </Bloco>

      <Bloco
        titulo="Dados da ótica"
        descricao="Como a ótica se identifica."
        rodape={
          <RodapeSalvar
            rotulo="Salvar dados da ótica"
            sujo={sujo(BLOCO_DADOS)}
            salvando={salvandoBloco(BLOCO_DADOS)}
            erro={erroDoBloco(BLOCO_DADOS)}
            onSalvar={() => salvarEmpresa.mutate(BLOCO_DADOS)}
          />
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </div>
      </Bloco>

      <Bloco
        titulo="Endereço e contato"
        descricao="Onde a ótica fica e como falar com ela."
        rodape={
          <RodapeSalvar
            rotulo="Salvar endereço e contato"
            sujo={sujo(BLOCO_ENDERECO)}
            salvando={salvandoBloco(BLOCO_ENDERECO)}
            erro={erroDoBloco(BLOCO_ENDERECO)}
            onSalvar={() => salvarEmpresa.mutate(BLOCO_ENDERECO)}
          />
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
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
        </div>
      </Bloco>

      {formOperacional && (
        <Bloco
          titulo="Regras operacionais"
          descricao="Limites e prazos que valem para toda a ótica."
          rodape={
            <RodapeSalvar
              rotulo="Salvar regras operacionais"
              sujo={operacionalSujo}
              salvando={salvarOperacional.isPending}
              erro={erroOperacional}
              onSalvar={() => salvarOperacional.mutate()}
            />
          }
        >
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          </div>
        </Bloco>
      )}

      <Bloco
        titulo="Formato de números e impressões"
        descricao="Muda como os números aparecem e são digitados nos formulários e o que sai nos PDFs. Vale na hora, sem botão de salvar."
        selo={<Badge tone="neutral">Só neste computador</Badge>}
      >
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-[var(--ink-2)]">Formato dos graus (esférico, cilíndrico, adição)</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {OPCOES_FORMATO.map((o) => (
                <label
                  key={o.valor}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                    formatoNumero === o.valor ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--rule-strong)] hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="formato-numero"
                    className="mt-1 accent-[var(--accent)]"
                    checked={formatoNumero === o.valor}
                    onChange={() => setFormatoNumero(o.valor)}
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-[var(--ink)]">
                      {o.titulo} <span className="font-mono-tab text-[var(--accent)]">{o.exemplo}</span>
                    </span>
                    <span className="text-xs text-[var(--ink-3)]">{o.ajuda}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-[var(--ink-3)]">
              O que fica gravado é o mesmo nos dois formatos. Porcentagens sempre aparecem com o valor exato e o símbolo %, como 8,99%.
            </p>
          </fieldset>

          <label className="flex items-start gap-2 border-t border-[var(--rule)] pt-4 text-sm text-[var(--ink-2)]">
            <input type="checkbox" className="mt-0.5" checked={exibirDp} onChange={(e) => setExibirDp(e.target.checked)} />
            <span>
              <b className="text-[var(--ink)]">Exibir DP (Distância Pupilar)</b>
              <span className="block text-xs text-[var(--ink-3)]">
                Mostra a DP (DNP direito + DNP esquerdo) na prescrição e nas impressões da prescrição e da OS. Desligado, ela some da tela e do
                papel, mas continua sendo gravada.
              </span>
            </span>
          </label>
        </div>
      </Bloco>
    </div>
  )
}
