import { CalendarPlus, Clock, Pencil, Trash2 } from 'lucide-react'
import type { Shift } from '../types'
import { durationHours, fmtDate, money, parseYmd } from '../dates'
import type { WeekSummary } from '../compute'

interface Props {
  weeks: WeekSummary[]
  onEdit: (shift: Shift) => void
  onDelete: (id: string) => void
  onAddToCalendar: (shift: Shift) => void
}

const storeTone = (store: string): string => {
  if (store.toLowerCase().includes('amazon')) return 'text-ember-600 border-ember/30 bg-ember/10'
  if (store.toLowerCase().includes('shopee')) return 'text-lime-700 border-lime-200 bg-gradient-to-r from-lime-100 to-lime-50'
  return 'text-azure-600 border-azure/30 bg-azure/10'
}

export function ShiftList({ weeks, onEdit, onDelete, onAddToCalendar }: Props) {
  if (!weeks.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center">
        <p className="text-sm text-slate-500">Nenhum turno registrado ainda.</p>
        <p className="mt-1 text-xs text-slate-500">Comece pelo formulário ao lado — os dados ficam só neste aparelho.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {weeks.map((week) => (
        <section key={week.key}>
          <header className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">
              {week.label} · {week.range}
            </h3>
            <span className="font-mono text-[11px] text-slate-500">
              {week.shifts.length} turno(s) · {money(week.total)}
            </span>
          </header>

          <ul className="space-y-2">
            {week.shifts.map((shift) => (
              <li
                key={shift.id}
                className="group flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 transition hover:border-lime/30"
              >
                <div className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-slate-100 py-1.5">
                  <span className="font-mono text-[10px] uppercase text-slate-500">
                    {parseYmd(shift.date).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                  </span>
                  <span className="font-display text-base font-bold text-slate-900">
                    {fmtDate(shift.date, { day: '2-digit' })}
                  </span>
                </div>

                <div className="min-w-[120px] flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase ${storeTone(shift.store)}`}>
                      {shift.store}
                    </span>
                    <span className="flex items-center gap-1 font-mono text-xs text-slate-500">
                      <Clock size={11} />
                      {shift.start} → {shift.end}
                    </span>
                  </div>
                  {shift.note && <p className="mt-1 truncate text-xs text-slate-500">{shift.note}</p>}
                </div>

                <div className="ml-auto flex items-center gap-3">
                  <span className="font-mono text-xs text-slate-500">{durationHours(shift.start, shift.end)}h</span>
                  <span className="font-mono text-sm font-semibold gradient-lime">{money(shift.value)}</span>
                  <div className="flex items-center gap-1 opacity-70 transition group-hover:opacity-100">
                    <button
                      type="button"
                      title="Adicionar ao Google Agenda"
                      onClick={() => onAddToCalendar(shift)}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:border-lime/40 hover:text-lime-700"
                    >
                      <CalendarPlus size={14} />
                    </button>
                    <button
                      type="button"
                      title="Editar"
                      onClick={() => onEdit(shift)}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:border-azure/40 hover:text-azure-600"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      title="Excluir"
                      onClick={() => onDelete(shift.id)}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:border-red-400/40 hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
