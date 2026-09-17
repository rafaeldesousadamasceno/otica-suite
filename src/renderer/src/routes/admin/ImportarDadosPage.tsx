import { type ReactNode, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Card, CardBody, CardHeader, CardTitle } from '@renderer/components/ui/Card'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { Badge } from '@renderer/components/ui/Badge'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { toast } from '@renderer/state/toastStore'
import type { MigracaoResultado } from '@shared/types'

interface FormState {
  host: string
  porta: string
  usuario: string
  senha: string
  banco: string
}

const VALORES_PADRAO: FormState = {
  host: 'localhost',
  porta: '3306',
  usuario: 'dba',
  senha: '85163494',
  banco: 'mdoculos'
}

export function ImportarDadosPage(): ReactNode {
  const [form, setForm] = useState<FormState>(VALORES_PADRAO)
  const [resultado, setResultado] = useState<MigracaoResultado | null>(null)

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function conexao(): { host: string; porta: number; usuario: string; senha: string; banco: string } {
    return {
      host: form.host,
      porta: Number(form.porta),
      usuario: form.usuario,
      senha: form.senha,
      banco: form.banco
    }
  }

  const testar = useMutation({
    mutationFn: () => unwrap(window.api.migracao.testarConexao(conexao())),
    onSuccess: () => toast.ok('Conexão bem-sucedida.'),
    onError: (err) => toast.error(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  const importar = useMutation({
    mutationFn: () => unwrap(window.api.migracao.importar(conexao())),
    onSuccess: (dados) => {
      setResultado(dados)
      toast.ok('Importação concluída.')
    },
    onError: (err) => toast.error(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  function onImportarClick(): void {
    const confirmado = window.confirm(
      'Isso vai importar os dados do sistema antigo para este sistema. Pode ser executado mais de uma vez sem duplicar registros já importados. Continuar?'
    )
    if (confirmado) importar.mutate()
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-[var(--ink)]">Importar Dados do MD Óculos</h1>

      <p className="text-sm text-[var(--ink-3)]">
        Esta ferramenta conecta ao banco de dados MySQL do sistema antigo (MD Óculos) pela rede, lê os
        clientes, exames e despesas de lá e grava cópias convertidas neste sistema novo. O banco antigo
        nunca é alterado (acesso somente leitura) e a importação pode ser executada mais de uma vez sem
        risco de duplicar registros já importados.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Conexão com o banco antigo</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Host" htmlFor="migracao-host">
              <Input id="migracao-host" value={form.host} onChange={(e) => set('host', e.target.value)} />
            </Field>
            <Field label="Porta" htmlFor="migracao-porta">
              <Input
                id="migracao-porta"
                className="font-mono-tab"
                value={form.porta}
                onChange={(e) => set('porta', e.target.value)}
              />
            </Field>
            <Field label="Usuário" htmlFor="migracao-usuario">
              <Input id="migracao-usuario" value={form.usuario} onChange={(e) => set('usuario', e.target.value)} />
            </Field>
            <Field label="Senha" htmlFor="migracao-senha">
              <Input
                id="migracao-senha"
                type="password"
                value={form.senha}
                onChange={(e) => set('senha', e.target.value)}
              />
            </Field>
            <Field label="Banco" htmlFor="migracao-banco">
              <Input id="migracao-banco" value={form.banco} onChange={(e) => set('banco', e.target.value)} />
            </Field>
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--rule)] pt-4">
            <Button variant="secondary" loading={testar.isPending} onClick={() => testar.mutate()}>
              Testar conexão
            </Button>
            <Button loading={importar.isPending} onClick={onImportarClick}>
              Importar
            </Button>
          </div>
        </CardBody>
      </Card>

      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle>Resultado da importação</CardTitle>
            {resultado.avisos.length > 0 && (
              <Badge tone="warn">⚠ {resultado.avisos.length} avisos</Badge>
            )}
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <p className="text-xs text-[var(--ink-3)]">
              Cada exame antigo vira uma receita óptica, uma venda e uma ordem de serviço no novo sistema.
            </p>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <ResumoItem label="Clientes importados" valor={resultado.clientesImportados} />
              <ResumoItem label="Clientes ignorados" valor={resultado.clientesIgnorados} />
              <ResumoItem label="Receitas ópticas e vendas importadas" valor={resultado.examesImportados} />
              <ResumoItem label="Receitas ópticas e vendas ignoradas" valor={resultado.examesIgnorados} />
              <ResumoItem label="Despesas importadas" valor={resultado.despesasImportadas} />
              <ResumoItem label="Despesas ignoradas" valor={resultado.despesasIgnoradas} />
            </div>

            {resultado.avisos.length > 0 && (
              <div className="overflow-hidden overflow-x-auto rounded-md border border-[var(--rule)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                      <th className="px-4 py-2.5">Tabela</th>
                      <th className="px-4 py-2.5">ID de origem</th>
                      <th className="px-4 py-2.5">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.avisos.map((aviso, i) => (
                      <tr key={i} className="border-b border-[var(--rule)] last:border-0">
                        <td className="px-4 py-2.5 text-[var(--ink)]">{aviso.tabela}</td>
                        <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">{aviso.origemId}</td>
                        <td className="px-4 py-2.5 text-[var(--ink-2)]">{aviso.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  )
}

function ResumoItem({ label, valor }: { label: string; valor: number }): ReactNode {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-[var(--ink-3)]">{label}</span>
      <span className="text-lg font-semibold text-[var(--ink)]">{valor}</span>
    </div>
  )
}
