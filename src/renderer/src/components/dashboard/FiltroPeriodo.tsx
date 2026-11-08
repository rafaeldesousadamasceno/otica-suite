import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@renderer/components/ui/Card'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { unwrap } from '@renderer/lib/ipc'
import { useAuthStore } from '@renderer/state/authStore'
import { PRESETS_PERIODO, ROTULO_PRESET, type PresetPeriodo } from '@shared/periodos'
import { possuiPermissao } from '@shared/permissions'
import type { FiltroDashboard } from '@renderer/lib/useFiltroDashboard'

const dataBr = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/**
 * Barra de filtros do painel: atalhos de periodo, datas livres, comparacao
 * com o periodo anterior e (so para quem ve a equipe) o vendedor.
 */
export function FiltroPeriodo({
  filtro,
  comparacao
}: {
  filtro: FiltroDashboard
  comparacao: { inicio: string; fim: string } | null
}): ReactNode {
  const sessao = useAuthStore((s) => s.sessao)
  const verEquipe = sessao ? possuiPermissao(sessao.usuario.perfil, 'relatorios_gerenciais', 'ver') : false

  const usuarios = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => unwrap(window.api.usuarios.list()),
    enabled: verEquipe
  })
  const vendedores = (usuarios.data ?? []).filter((u) => u.perfil === 'vendedor' && u.ativo)

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--ink-2)]">
          Período
          <Select className="w-48" value={filtro.preset} onChange={(e) => filtro.setPreset(e.target.value as PresetPeriodo)}>
            {PRESETS_PERIODO.map((p) => (
              <option key={p} value={p}>
                {ROTULO_PRESET[p]}
              </option>
            ))}
          </Select>
        </label>

        {filtro.preset === 'personalizado' && (
          <>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--ink-2)]">
              De
              <Input
                type="date"
                className="w-40"
                value={filtro.periodo.inicio}
                onChange={(e) => e.target.value && filtro.setPersonalizado(e.target.value, filtro.periodo.fim)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--ink-2)]">
              Até
              <Input
                type="date"
                className="w-40"
                value={filtro.periodo.fim}
                onChange={(e) => e.target.value && filtro.setPersonalizado(filtro.periodo.inicio, e.target.value)}
              />
            </label>
          </>
        )}

        {verEquipe && (
          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--ink-2)]">
            Vendedor
            <Select
              className="w-48"
              value={filtro.vendedorId ?? ''}
              onChange={(e) => filtro.setVendedor(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Todos</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </Select>
          </label>
        )}

        <label className="flex h-9 items-center gap-2 text-sm text-[var(--ink-2)]">
          <input
            type="checkbox"
            checked={filtro.comparar}
            onChange={(e) => filtro.setComparar(e.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          Comparar com o período anterior
        </label>
      </div>

      <p className="mt-3 text-xs text-[var(--ink-3)]" aria-live="polite">
        {filtro.erroPeriodo ? (
          <span className="text-[var(--danger)]">{filtro.erroPeriodo} Mostrando este mês.</span>
        ) : (
          <>
            Mostrando <strong className="text-[var(--ink-2)]">{dataBr(filtro.periodo.inicio)}</strong>
            {filtro.periodo.inicio !== filtro.periodo.fim && (
              <>
                {' '}
                a <strong className="text-[var(--ink-2)]">{dataBr(filtro.periodo.fim)}</strong>
              </>
            )}
            {comparacao && (
              <>
                {' '}
                · comparando com {dataBr(comparacao.inicio)}
                {comparacao.inicio !== comparacao.fim && <> a {dataBr(comparacao.fim)}</>}
              </>
            )}
          </>
        )}
      </p>
    </Card>
  )
}
