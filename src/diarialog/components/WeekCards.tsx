import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Wallet } from 'lucide-react'
import type { WeekSummary } from '../compute'
import { STATUS_META } from '../compute'
import { fmtDate, fmtDayMonth, fmtWeekday, money } from '../dates'

interface Props {
  weeks: WeekSummary[]
  onSetDeposit: (weekKey: string, amount: number, paidAt: string) => void
  onRemoveDeposit: (weekKey: string) => void
}

export function WeekCards({ weeks, onSetDeposit, onRemoveDeposit }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState('')

  if (!weeks.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
        Registre turnos para ver as semanas e a janela de repasse.
      </div>
    )
  }

  function openDeposit(week: WeekSummary) {
    setEditing(week.key)
    setAmount(week.deposit ? String(week.deposit.amount) : String(week.total))
    setPaidAt(week.deposit?.paidAt ?? new Date().toISOString().slice(0, 10))
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {weeks.map((week) => {
        const meta = STATUS_META[week.status]
        const overdue = week.status === 'atrasado'
        return (
          <article
            key={week.key}
            className={`card-gradient rounded-2xl p-5 transition ${overdue ? 'ring-1 ring-ember-300' : week.status === 'pago' ? 'ring-1 ring-lime-200' : ''}`}
          >
            <header className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">{week.label}</h3>
                <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">{week.range}</p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${meta.tone}`}>
                {meta.label}
              </span>
            </header>

            <dl className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 px-3 py-2">
                <dt className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Previsto</dt>
                <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-900">{money(week.total)}</dd>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 px-3 py-2">
                <dt className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Horas</dt>
                <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-900">{week.hours}h</dd>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 px-3 py-2">
                <dt className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Dias</dt>
                <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-900">{week.days}</dd>
              </div>
            </dl>

            <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <Clock size={13} className="shrink-0 text-slate-500" />
              <span>
                Repasse de{' '}
                <b className="text-slate-800">
                  {fmtWeekday(week.window.start)} {fmtDayMonth(week.window.start)} 00:00
                </b>{' '}
                até{' '}
                <b className="text-slate-800">
                  {fmtWeekday(week.window.end)} {fmtDayMonth(week.window.end)} 22:00
                </b>
              </span>
            </div>

            {week.deposit ? (
              <div className="mt-3 rounded-xl border border-lime-200 bg-gradient-to-br from-lime-50 via-white to-white px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-lime-700">
                    <CheckCircle2 size={14} /> Depositado em {fmtDate(week.deposit.paidAt)}
                  </span>
                  <span className="font-mono text-sm font-semibold gradient-lime">{money(week.deposit.amount)}</span>
                </div>
                <p className="mt-1 font-mono text-[11px] text-slate-500">
                  {week.diff === 0
                    ? '✓ bate com o previsto'
                    : `diferença de ${money(Math.abs(week.diff ?? 0))} ${week.diff! > 0 ? 'a mais' : 'a menos'}`}
                </p>
                <button
                  type="button"
                  onClick={() => onRemoveDeposit(week.key)}
                  className="mt-1 font-mono text-[11px] text-slate-500 underline-offset-2 hover:text-ember-600 hover:underline"
                >
                  remover conferência
                </button>
              </div>
            ) : overdue ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-ember/25 bg-ember/[0.07] px-3 py-2 text-xs text-ember-600">
                <AlertTriangle size={14} /> Passou de sexta 22:00 — repasse atrasado.
              </div>
            ) : null}

            <button type="button" onClick={() => openDeposit(week)} className="btn-ghost mt-4 w-full">
              <Wallet size={15} />
              {week.deposit ? 'Editar depósito' : 'Registrar depósito'}
            </button>

            {editing === week.key && (
              <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label" htmlFor={`dep-amount-${week.key}`}>
                      Valor depositado
                    </label>
                    <input
                      id={`dep-amount-${week.key}`}
                      type="number"
                      min={0}
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`dep-date-${week.key}`}>
                      Data do pix
                    </label>
                    <input
                      id={`dep-date-${week.key}`}
                      type="date"
                      value={paidAt}
                      onChange={(e) => setPaidAt(e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-primary flex-1"
                    onClick={() => {
                      const value = Number(amount)
                      if (!value || value <= 0) return
                      onSetDeposit(week.key, value, paidAt)
                      setEditing(null)
                    }}
                  >
                    Confirmar
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
