import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, CalendarPlus, Clock, Coins, FileDown, Sparkles } from 'lucide-react'
import type { Shift, StoreName } from '../types'
import { STORES } from '../types'
import { durationHours, money, ymd } from '../dates'
import { shiftTitle } from '../calendar'

interface Props {
  editing: Shift | null
  onSubmit: (data: Omit<Shift, 'id' | 'createdAt'>) => void
  onCancelEdit: () => void
}

const emptyForm = (): Omit<Shift, 'id' | 'createdAt'> => ({
  date: ymd(new Date()),
  store: 'Amazon' as StoreName,
  start: '08:00',
  end: '16:00',
  value: 0,
  note: '',
})

/**
 * Abre o calendário nativo ao clicar no campo de data.
 * `showPicker()` só roda em gesto do usuário (por isso fica no onClick);
 * em navegador sem suporte, o campo apenas recebe foco.
 */
function openCalendar(event: { currentTarget: HTMLInputElement }) {
  const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void }
  try {
    input.showPicker?.()
  } catch {
    input.focus()
  }
}

export function ShiftForm({ editing, onSubmit, onCancelEdit }: Props) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  useEffect(() => {
    if (editing) {
      const { id: _id, createdAt: _createdAt, ...rest } = editing
      setForm({ ...rest, note: rest.note ?? '' })
      setError('')
    }
  }, [editing])

  const hours = useMemo(() => durationHours(form.start, form.end), [form.start, form.end])
  const overnight = form.end <= form.start
  const preview = useMemo(() => shiftTitle({ ...form, id: 'preview', createdAt: 0 }), [form])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!form.date) return setError('Escolha o dia trabalhado.')
    if (!form.start || !form.end) return setError('Informe entrada e saída.')
    if (!(form.value > 0)) return setError('Informe o valor a receber (maior que zero).')
    onSubmit({ ...form, value: Number(form.value), note: form.note?.trim() })
    setForm(emptyForm())
    setError('')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label" htmlFor="dl-date">
            Dia trabalhado
          </label>
          <input
            id="dl-date"
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            onClick={openCalendar}
            className="w-full"
          />
          <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
            <CalendarDays size={11} /> Clique no campo para abrir o calendário.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="dl-store">
            Loja / cliente
          </label>
          <select
            id="dl-store"
            value={form.store}
            onChange={(e) => setForm((f) => ({ ...f, store: e.target.value }))}
            className="w-full"
          >
            {STORES.map((store) => (
              <option key={store} value={store}>
                {store}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="dl-value">
            Valor a receber
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-slate-500">
              R$
            </span>
            <input
              id="dl-value"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={form.value || ''}
              placeholder="0,00"
              onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) }))}
              className="w-full pl-9"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="dl-start">
            Entrada
          </label>
          <input
            id="dl-start"
            type="time"
            value={form.start}
            onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
            className="w-full"
          />
        </div>

        <div>
          <label className="label" htmlFor="dl-end">
            Saída
          </label>
          <input
            id="dl-end"
            type="time"
            value={form.end}
            onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
            className="w-full"
          />
        </div>

        <div className="col-span-2">
          <label className="label" htmlFor="dl-note">
            Observação (opcional)
          </label>
          <input
            id="dl-note"
            type="text"
            value={form.note ?? ''}
            placeholder="ex.: CD noturno, avaliação da semana..."
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            className="w-full"
          />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-lime-50/70 via-white to-white p-3">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-lime-400 via-azure-400 to-transparent" />
        <p className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
          <CalendarPlus size={12} /> como fica no seu calendário
        </p>
        <p className="text-sm font-medium text-slate-800">{preview}</p>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
          <Clock size={12} />
          {hours}h de turno {overnight && <span className="text-ember-600">· vira a meia-noite</span>}
          {!overnight && hours === 0 && <span className="text-ember-600">· revise os horários</span>}
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs text-ember-600">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary">
          <Sparkles size={15} />
          {editing ? 'Salvar alterações' : 'Registrar turno'}
        </button>
        {editing && (
          <button type="button" className="btn-ghost" onClick={onCancelEdit}>
            Cancelar
          </button>
        )}
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
          <Coins size={12} className="text-lime-700" />
          {money(form.value || 0)}
        </span>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <FileDown size={12} /> Depois de salvar, dá pra mandar o turno direto pro Google Agenda.
      </p>
    </form>
  )
}
