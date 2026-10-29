import { CheckCircle2, FileDown, FileUp, RotateCcw, TriangleAlert } from 'lucide-react'
import type { WeekSummary } from '../compute'
import { STATUS_META } from '../compute'
import { money } from '../dates'

interface Props {
  weeks: WeekSummary[]
  onExportShifts: () => void
  onExportConference: () => void
  onImport: (file: File) => void
  onLoadDemo: () => void
  onClear: () => void
}

export function Conference({ weeks, onExportShifts, onExportConference, onImport, onLoadDemo, onClear }: Props) {
  const previsto = weeks.reduce((sum, w) => sum + w.total, 0)
  const depositado = weeks.reduce((sum, w) => sum + (w.deposit?.amount ?? 0), 0)
  const diff = depositado - previsto
  const pending = weeks.filter((w) => w.status === 'aberto' || w.status === 'atrasado')

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card-gradient rounded-2xl p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">Total previsto</p>
          <p className="mt-1 font-display text-xl font-bold text-slate-900">{money(previsto)}</p>
        </div>
        <div className="card-gradient rounded-2xl p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">Total depositado</p>
          <p className="mt-1 font-display text-xl font-bold gradient-lime">{money(depositado)}</p>
        </div>
        <div className="card-gradient rounded-2xl p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">Diferença</p>
          <p className={`mt-1 font-display text-xl font-bold ${diff === 0 ? 'text-slate-900' : diff > 0 ? 'text-lime-700' : 'text-ember-600'}`}>
            {money(diff)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {diff === 0 ? 'tudo bate' : diff > 0 ? 'recebido a mais' : 'faltou receber'}
          </p>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-ember/25 bg-ember/[0.06] px-4 py-3 text-xs text-ember-600">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          <span>
            {pending.length} semana(s) sem conferência:{' '}
            {pending.map((w) => `${w.label} (${w.range})`).join(' · ')}
          </span>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-3 font-medium">Semana</th>
                <th className="px-4 py-3 font-medium">Período</th>
                <th className="px-4 py-3 font-medium">Turnos</th>
                <th className="px-4 py-3 text-right font-medium">Previsto</th>
                <th className="px-4 py-3 text-right font-medium">Depositado</th>
                <th className="px-4 py-3 text-right font-medium">Diferença</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => {
                const meta = STATUS_META[week.status]
                return (
                  <tr key={week.key} className="border-b border-slate-100 transition hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-800">{week.label}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{week.range}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{week.shifts.length}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-800">{money(week.total)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-800">
                      {week.deposit ? money(week.deposit.amount) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {week.diff === null ? (
                        <span className="text-slate-500">—</span>
                      ) : week.diff === 0 ? (
                        <span className="inline-flex items-center gap-1 text-lime-700">
                          <CheckCircle2 size={12} /> ok
                        </span>
                      ) : (
                        <span className={week.diff > 0 ? 'text-lime-700' : 'text-ember-600'}>{money(week.diff)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${meta.tone}`}>
                        {meta.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {!weeks.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                    Sem dados para conferir ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" onClick={onExportConference}>
          <FileDown size={15} /> Exportar conferência (CSV)
        </button>
        <button type="button" className="btn-ghost" onClick={onExportShifts}>
          <FileDown size={15} /> Exportar turnos (CSV)
        </button>
        <label className="btn-ghost cursor-pointer">
          <FileUp size={15} /> Importar backup (JSON)
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onImport(file)
              e.target.value = ''
            }}
          />
        </label>
        <button type="button" className="btn-ghost" onClick={onLoadDemo}>
          <RotateCcw size={15} /> Carregar exemplo
        </button>
        <button type="button" className="btn-danger ml-auto" onClick={onClear}>
          Limpar tudo
        </button>
      </div>
    </div>
  )
}
